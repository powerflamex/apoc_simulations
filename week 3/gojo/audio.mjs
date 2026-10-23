// Procedural soundtrack for "What if Gojo attacked your city?", synced to src/timeline.js (video clock).
//   node audio.mjs  -> out/soundtrack.wav
// Cinematic (the black-hole video's music layers): a minor drone that darkens and climbs, trailer braams on every
// technique, sub-bass. Under it the city: traffic and a crowd that screams and runs at the start. Blue: a deep
// sucking roar with wind swirling round (it grows with the reach), low groans of metal being crushed, the ball's
// landing boom. Red: a whine as it charges, a whoosh, the tower's explosion (seen first; the boom arrives 2.2 s
// later, at the speed of sound) and a soft shower of glass. Hollow Purple: a rising hum while it forms, a sub drop
// and a huge roar as it goes; the second one roars past you on the left. The Domain: a hush, a deep boom, then a
// shimmering high pad and sparkling streams of sound that thicken into a riser and the white, which turns back
// into the first frame (the loop). No sharp clicks anywhere: every hit is a soft-edged, low thud.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { VIDEO_DURATION, LOOP, BALL_LAND, V_RELEASE, V_RED_FORM, V_RED, V_RED_HIT, PURPLES, V_SIGN, V_DOMAIN, V_INSIDE, V_WHITE, T_SWITCH,
  blueOn, blueR, BLUE_MAX } from './src/timeline.js';
import { rng, smooth, clamp } from './src/util.js';

const SR = 48000;
const TAU = Math.PI * 2;
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
const env = (dt, a, d) => (dt < 0 ? 0 : Math.min(dt / a, 1) * Math.exp(-Math.max(0, dt - a) / d));
const [P1, P2] = PURPLES;

export function makeSoundtrack(outFile) {
  const N = Math.round(VIDEO_DURATION * SR);
  const N0 = Math.round(LOOP * SR);
  const L = new Float32Array(N), R = new Float32Array(N);
  const PL = new Float32Array(N0), PR = new Float32Array(N0);
  const R0 = rng(777);
  const white = () => R0() * 2 - 1;

  // braam hits: [time, strength, root Hz]
  const HITS = [[3.3, 0.6, 55], [V_RED, 0.75, 49], [V_RED_HIT, 0.55, 46.25], [P1.fire, 1.0, 41.2], [P2.fire, 1.1, 36.7], [V_DOMAIN, 1.2, 32.7]];
  // low booms (soft thuds with a long rumble): [time, size, pan]
  const BOOMS = [[BALL_LAND, 0.9, -0.1], [V_RED_HIT + 2.2, 1.3, 0], [P1.fire + 0.05, 0.8, 0.2], [P2.fire + 0.3, 1.4, -0.5], [V_DOMAIN, 1.0, 0]];
  for (let i = 0; i < 9; i++) BOOMS.push([P1.fire + 1.2 + i * 0.45 + R0() * 0.2, 0.25 + R0() * 0.2, R0() * 1.4 - 0.7]);   // the tops landing in the trench
  // drone chords (Hz): D minor -> Bb -> G minor -> a dark cluster in the void
  const CHORDS = [[-2, [73.42, 110, 146.83, 174.61]], [V_RED_FORM, [58.27, 87.31, 116.54, 146.83]], [P1.form0, [49, 73.42, 98, 116.54]], [V_DOMAIN, [43.65, 65.41, 87.31, 92.5]]];
  const chordAt = (t) => { let c = CHORDS[0][1]; for (const [ts, ch] of CHORDS) if (t >= ts) c = ch; return c; };
  // the void's sparkle: soft high sine grains
  const grains = [];
  for (let i = 0; i < 2600; i++) {
    const t = V_INSIDE - 0.5 + Math.pow(R0(), 0.6) * (V_WHITE - V_INSIDE + 0.5);
    grains.push({ t, f: 900 + R0() * 3200, d: 0.08 + R0() * 0.25, g: 0.006 + R0() * 0.012, pan: R0() * 2 - 1 });
  }
  grains.sort((a, b) => a.t - b.t);

  const ph = new Float64Array(16);
  let brownL = 0, brownR = 0, subPh = 0, whinePh = 0, humPh = [0, 0, 0], padPh = [0, 0, 0, 0, 0];
  const braamPh = [0, 0, 0, 0];
  const cityL = new OnePole(250), cityR = new OnePole(280);
  const crowdF = [new SVF(), new SVF()], windL = new SVF(), windR = new SVF(), roarF = new SVF(), glassF = new SVF(), hissF = new SVF();
  const subLP = new OnePole(70), boomLP = new OnePole(120), boomLP2 = new OnePole(60);
  const droneLP = [new OnePole(400), new OnePole(400)];
  const braamLP = new SVF(), riserF = new SVF(), groanF = new SVF();
  const revL = new Reverb(1), revR = new Reverb(2);
  let gi = 0;
  const active = [];
  let groanPh = 0;

  for (let n = -N0; n < N; n++) {
    const t = n / SR;
    const inside = t >= V_INSIDE;
    // ---- the city: traffic rumble, the crowd (screams turning into running), fading out as it falls apart ----
    brownL = clamp(brownL + white() * 0.02, -1, 1) * 0.998; brownR = clamp(brownR + white() * 0.02, -1, 1) * 0.998;
    const cityG = 0.28 * (1 - smooth(V_DOMAIN, V_INSIDE, t));
    const cl = cityL.run(brownL) * cityG, cr = cityR.run(brownR) * cityG;
    const crowdG = 0.05 * (1 - smooth(4, 10, t)) * (t > -3 ? 1 : 0);
    const cm = 0.6 + 0.4 * Math.sin(t * 5.3) * Math.sin(t * 2.1 + 1);
    const crw = (crowdF[0].run(white(), 1100 + 300 * Math.sin(t * 1.7), 0.6).bp + crowdF[1].run(white(), 2300 + 400 * Math.sin(t * 2.3), 0.7).bp * 0.5) * crowdG * cm;

    // ---- Blue: the pull ----
    const bOn = blueOn(t), reach = blueR(t) / BLUE_MAX;
    const suck = bOn * (0.3 + 0.7 * reach);
    const wfc = 280 + 900 * reach + 200 * Math.sin(t * 2.7);
    const pan = 0.6 * Math.sin(t * 3.1);
    const wl = windL.run(white(), wfc, 0.4).bp * suck * 0.55 * (1 - pan * 0.5);
    const wr = windR.run(white(), wfc * 1.1, 0.4).bp * suck * 0.55 * (1 + pan * 0.5);
    subPh += (34 + 10 * reach) / SR;
    const sub = (Math.sin(TAU * subPh) * 0.5 + subLP.run(white()) * 2.0) * suck * 0.5;
    // metal groaning as it is crushed: a low saw bending down, softened
    groanPh += (62 + 18 * Math.sin(t * 0.9) - 10 * Math.sin(t * 3.7)) / SR;
    const groan = groanF.run(saw(groanPh) + 0.5 * saw(groanPh * 1.49), 300, 0.9).lp * suck * 0.08 * (0.5 + 0.5 * Math.sin(t * 1.3));

    // ---- Red: the charging whine ----
    let whine = 0;
    if (t > V_RED_FORM && t < V_RED + 0.3) {
      const k = smooth(V_RED_FORM, V_RED, t);
      whinePh += (180 + 700 * k * k) / SR;
      whine = (Math.sin(TAU * whinePh) + 0.3 * Math.sin(TAU * whinePh * 2.01)) * 0.035 * k * (1 - smooth(V_RED, V_RED + 0.3, t));
    }
    // the whoosh as it goes, and the roar of Purple going past
    let roarG = 0;
    roarG += 0.5 * env(t - V_RED, 0.05, 0.8);
    roarG += 0.9 * env(t - P1.fire, 0.1, 1.6);
    roarG += 1.4 * env(t - (P2.fire + 0.1), 0.15, 1.2);
    const roarFc = 300 + 1500 * env(t - V_RED, 0.05, 0.5) + 800 * env(t - P2.fire, 0.2, 0.8);
    const roar = roarF.run(white(), roarFc, 0.5).bp * roarG * 0.6;
    const roarPan = t > P2.fire - 0.2 && t < P2.fire + 2.5 ? -0.7 : 0;
    // the glass: a soft rushing shimmer (no clicks)
    const glassG = 0.12 * smooth(V_RED + 0.1, V_RED + 0.4, t) * (1 - smooth(V_RED + 1.5, V_RED + 5, t));
    const glass = glassF.run(white(), 5200 + 800 * Math.sin(t * 9), 0.9).bp * glassG * (0.6 + 0.4 * Math.sin(t * 17));
    // Purple forming: a rising hum, a hiss of air drawn into it
    let hum = 0, hiss = 0;
    for (const P of PURPLES) {
      if (t > P.form0 - 0.5 && t < P.fire + 0.5) {
        const k = smooth(P.form0, P.fire, t);
        for (let j = 0; j < 3; j++) { humPh[j] += ((55 + 50 * k) * [1, 1.5, 2.003][j]) / SR; hum += Math.sin(TAU * humPh[j]) * [0.5, 0.3, 0.2][j]; }
        hum *= 0.12 * k * (1 - smooth(P.fire, P.fire + 0.4, t)) * (P === P2 ? 1.4 : 1);
        hiss += hissF.run(white(), 1800 + 3000 * k, 0.7).bp * 0.1 * k * (1 - smooth(P.fire, P.fire + 0.4, t));
      }
    }

    // ---- booms ----
    let boom = 0, boomPanSum = 0;
    for (const [bt, size, bp] of BOOMS) {
      const dt = t - bt;
      if (dt < -0.01 || dt > 8) continue;
      const e = (dt < 0.03 ? dt / 0.03 : 1) * (Math.exp(-dt / 0.35) * 0.8 + Math.exp(-dt / 2.4) * 0.35) * size;
      const x = Math.sin(TAU * (38 - 10 * Math.min(dt, 1)) * dt) * 0.6 + white() * 0.9;
      boom += x * e; boomPanSum += bp * e;
    }
    boom = boomLP2.run(boomLP.run(boom)) * 1.6;

    // ---- music: drone, braams ----
    const ch = chordAt(t);
    const dG = 0.09 * smooth(-2, 3, t) * (1 + 0.5 * smooth(20, 40, t)) * (1 - 0.6 * smooth(V_INSIDE, V_INSIDE + 2, t));
    const cutoff = 300 + 700 * smooth(0, 42, t) + 1500 * smooth(V_INSIDE, V_WHITE, t);
    droneLP[0].set(cutoff); droneLP[1].set(cutoff * 1.07);
    let dl = 0, dr = 0;
    for (let k = 0; k < 4; k++) {
      const bend = 1 + 0.05 * Math.pow(smooth(V_INSIDE, V_WHITE, t), 2);
      ph[k] += (ch[k] * bend * 0.997) / SR; ph[k + 4] += (ch[k] * bend * 1.003) / SR;
      dl += saw(ph[k]) * (k === 0 ? 0.9 : 0.6); dr += saw(ph[k + 4]) * (k === 0 ? 0.9 : 0.6);
    }
    dl = droneLP[0].run(dl) * dG; dr = droneLP[1].run(dr) * dG;
    let braam = 0;
    for (const [ht, hs, hf] of HITS) {
      const dt = t - ht;
      if (dt > -0.01 && dt < 7) {
        const e = env(dt, 0.06, 1.8) * hs;
        for (let k = 0; k < 4; k++) braamPh[k] += (hf * [1, 1.004, 2, 3.01][k]) / SR;
        braam += (saw(braamPh[0]) + saw(braamPh[1]) + 0.5 * saw(braamPh[2]) + 0.25 * saw(braamPh[3])) * e;
      }
    }
    braam = braamLP.run(braam, 850, 0.6).lp * 0.17;

    // ---- the void: a hush at the sign, a shimmering pad, sparkling grains, the riser into the white ----
    let pad = 0;
    const padG = 0.05 * smooth(V_DOMAIN + 0.5, V_INSIDE + 1.5, t) * (t < T_SWITCH ? 1 : 0);
    if (padG > 0) {
      const fs = [587.33, 698.46, 880, 1174.66, 1396.9];
      for (let k = 0; k < 5; k++) { padPh[k] += fs[k] * (1 + 0.003 * Math.sin(t * (0.7 + k))) / SR; pad += Math.sin(TAU * padPh[k]) * (0.5 + 0.5 * Math.sin(t * (0.5 + k * 0.37) + k)); }
      pad *= padG;
    }
    while (gi < grains.length && grains[gi].t <= t) active.push({ ...grains[gi++], age: 0, p: 0 });
    let gl = 0, gr = 0;
    for (let i = active.length - 1; i >= 0; i--) {
      const g = active[i];
      g.age += 1 / SR;
      if (g.age > g.d || t > T_SWITCH) { active.splice(i, 1); continue; }
      g.p += g.f / SR;
      const w = Math.sin(Math.PI * g.age / g.d) ** 2;   // smooth in, smooth out: no clicks
      const x = Math.sin(TAU * g.p) * w * g.g * (1 + 2 * smooth(V_INSIDE, V_WHITE, t));
      gl += x * (1 - g.pan) * 0.5; gr += x * (1 + g.pan) * 0.5;
    }
    let riser = 0;
    if (t > V_WHITE - 6 && t < T_SWITCH) {
      const k = smooth(V_WHITE - 6, V_WHITE, t);
      riser = riserF.run(white(), 300 + 7000 * k * k, 0.3).bp * k * k * 0.55 * (1 - smooth(V_WHITE + 0.1, T_SWITCH, t) * 0.7);
    }
    // the hush before the Domain: everything ducks for a moment
    const duck = 1 - 0.75 * smooth(V_SIGN, V_SIGN + 0.6, t) * (1 - smooth(V_DOMAIN - 0.05, V_DOMAIN + 0.05, t));

    const bpN = clamp(boomPanSum, -0.8, 0.8);
    let l = (cl + crw * 0.8 + wl + sub + groan + roar * (1 - roarPan) + glass * 0.8 + hum + hiss + dl + braam + whine) * duck + boom * (1 - bpN * 0.5) + pad + gl + riser;
    let r = (cr + crw + wr + sub + groan + roar * (1 + roarPan) + glass + hum + hiss * 0.9 + dr + braam + whine) * duck + boom * (1 + bpN * 0.5) + pad * 0.95 + gr + riser;
    const wet = (dl + dr) * 0.5 + braam * 0.8 + pad * 1.5 + (gl + gr) * 1.2 + boom * 0.2;
    l += revL.run(wet * 0.5) * 0.9; r += revR.run(wet * 0.5) * 0.9;
    if (n < 0) { PL[n + N0] = l; PR[n + N0] = r; } else { L[n] = l; R[n] = r; }
  }
  // in the white, the soundtrack turns into the lead-in to the first frame
  {
    const a = N - N0, xf = Math.round(0.5 * SR);
    for (let i = 0; i < N0; i++) {
      const kk = Math.min(1, i / xf), wi = Math.sin(kk * Math.PI / 2), wo = Math.cos(kk * Math.PI / 2);
      L[a + i] = L[a + i] * wo + PL[i] * wi; R[a + i] = R[a + i] * wo + PR[i] * wi;
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
