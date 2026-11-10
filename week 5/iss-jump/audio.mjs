// Procedural soundtrack for "What if you jumped off the space station?", synced to src/timeline.js (video clock).
//   node audio.mjs  -> out/soundtrack.wav
// Space is silent, so the sound is what you'd hear inside the helmet: your own breathing, the radio's hiss, the
// crew's muffled shouting and their fists on the glass (soft thumps through the hull), the owner's scream in the
// first second; a dark minor drone (black-hole style: a cosmic topic) with a trailer hit and sub drop on every beat;
// a soft whoosh at each sunrise of the time-lapse; your heartbeat from the lapse on, racing with the oxygen alarm,
// then stopping; the drone sinking through the long fall; then the air: a hiss that grows into a roar and a fire's
// crackle, a whoosh each time a part tears off; the quiet dusk on the ground (crickets, a gasp, the meteor's far
// hiss); the roar back; a deep boom and a riser into the white, which turns back into the helmet at the start (the
// loop). Every onset is soft (8 ms+): no clicks or clacks.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { VIDEO_DURATION, LOOP, T_SWITCH, BEATS, V_JUMP, V_LAPSE, V_O2, V_DROP, V_GLOW, V_FIRE, V_GROUND, V_BACK, V_BURST, state, sunPhase } from './src/timeline.js';
import { rng, smooth, clamp } from './src/util.js';

const SR = 48000;
const TAU = Math.PI * 2;
// the scream right at the start: sounds/scream.mp3 if the owner drops his own clip there, otherwise his "Noooo"
// (sounds/nooo.mp3). Both stay out of git (sounds/ is ignored).
const SCREAM_AT = 0.15;
const SCREAM_FILES = [['scream.mp3', 0.0], ['nooo.mp3', 0.55]];

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
    this.combs = [1557, 1617, 1491, 1422, 1277, 1356].map((n) => ({ buf: new Float32Array(Math.round(n * (1 + r() * 0.05) * 1.6)), i: 0, lp: 0 }));
    this.aps = [556, 441, 341].map((n) => ({ buf: new Float32Array(n), i: 0 }));
  }
  run(x, fb = 0.86, damp = 0.35) {
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
const env = (dt, att, dec) => (dt < 0 ? 0 : Math.min(dt / att, 1) * Math.exp(-dt / dec));

function loadClip(dir) {
  for (const [f, skip] of SCREAM_FILES) {
    const file = path.join(dir, 'sounds', f);
    if (!fs.existsSync(file)) continue;
    const r = spawnSync('ffmpeg', ['-v', 'error', '-ss', String(skip), '-i', file, '-ac', '1', '-ar', String(SR), '-f', 'f32le', '-'], { maxBuffer: 1 << 28 });
    if (r.status !== 0) continue;
    const raw = r.stdout, a = new Float32Array(raw.buffer, raw.byteOffset, raw.length / 4);
    let pk = 0; for (const x of a) pk = Math.max(pk, Math.abs(x));
    console.log(`audio: scream from sounds/${f}`);
    return { a, g: 0.62 / Math.max(pk, 1e-6) };
  }
  console.warn('audio: no sounds/scream.mp3 or sounds/nooo.mp3: the scream is left out');
  return null;
}

export function makeSoundtrack(outFile) {
  const N = Math.round(VIDEO_DURATION * SR);
  const N0 = Math.round(LOOP * SR);
  const L = new Float32Array(N), R = new Float32Array(N);
  const PL = new Float32Array(N0), PR = new Float32Array(N0);
  const R0 = rng(7171);
  const white = () => R0() * 2 - 1;
  const SC = loadClip(path.dirname(fileURLToPath(import.meta.url)));

  // per-sample story values on a coarse grid
  const STEP = 240;
  const grid = [];
  for (let n = -N0 - STEP; n < N + 2 * STEP; n += STEP) { const v = n / SR, s = state(v); grid.push({ glow: s.glow, dead: s.dead, ball: s.fireball, sun: sunPhase(v) }); }
  const at = (n) => { const f = (n + N0 + STEP) / STEP, i = Math.floor(f), k = f - i, a = grid[i], b = grid[i + 1] || a; return { glow: a.glow + (b.glow - a.glow) * k, dead: a.dead + (b.dead - a.dead) * k, ball: a.ball + (b.ball - a.ball) * k, sun: a.sun + (b.sun - a.sun) * k }; };

  // ---- the hits (trailer braam + sub drop) on the beats ----
  const HITS = BEATS.filter((b) => b.hit > 0).map((b) => ({ t: b.v, k: b.hit, root: b.kind === 'burst' ? 36.7 : b.kind === 'fire' ? 41.2 : 49 }));
  // ---- the sunrises: a soft whoosh each time the Sun comes up (sunPhase crossing 270 + 360k) ----
  const rises = [];
  { let last = sunPhase(-1.5); for (let v = -1.5; v < T_SWITCH; v += 1 / 240) { const p = sunPhase(v); if (Math.floor((p - 270) / 360) > Math.floor((last - 270) / 360)) rises.push(v); last = p; } }
  // ---- the fists on the glass: soft thumps through the hull until you push off ----
  const bangs = [];
  for (let t = -1.5; t < V_JUMP + 2.5; t += 0.27) bangs.push({ t: t + R0() * 0.08, g: 0.05 + 0.03 * R0(), f: 70 + R0() * 30, ph: 0, lp: new OnePole(220) });
  // ---- the crew's muffled shouting (formant bursts) ----
  const shouts = [];
  for (let k = 0; k < 9; k++) shouts.push({ t: -1.2 + k * 0.55 + R0() * 0.2, d: 0.3 + 0.35 * R0(), f: 160 + R0() * 120, vow: R0(), ph: 0, fA: new SVF(), fB: new SVF() });
  // ---- parts tearing off: whooshes ----
  const tears = [36.2, 38.3, 39.7, 41.1, 44.3].map((t) => ({ t, d: 0.7, f: new SVF() }));
  // ---- the crackle of the fire: many soft, filtered puffs ----
  const puffs = [];
  for (let k = 0; k < 900; k++) puffs.push({ t: V_GLOW + 1 + R0() * (T_SWITCH - V_GLOW - 1), d: 0.03 + 0.08 * R0(), g: 0.3 + 0.7 * R0(), pan: R0() * 1.4 - 0.7, lp: new OnePole(600 + 2400 * R0()) });
  // ---- the drone's chords (Hz), darkening ----
  const CHORDS = [[-9, [110, 130.8, 164.8]], [V_LAPSE, [98, 116.5, 146.8]], [V_O2, [87.3, 103.8, 130.8]], [V_DROP, [73.4, 87.3, 110]], [V_GLOW, [65.4, 77.8, 98]], [V_FIRE, [55, 65.4, 82.4]]];
  const chordAt = (t) => { let c = CHORDS[0][1]; for (const [ts, ch] of CHORDS) if (t >= ts) c = ch; return c; };

  const breathF = [new SVF(), new SVF()], breathLP = new OnePole(1800);
  const radioF = new SVF(), radioLP = new OnePole(3000), crackE = new OnePole(40);
  const riseF = new SVF();
  const beepLP = new OnePole(2600);
  const heartLP = new OnePole(90);
  const windF = [new SVF(), new SVF(), new SVF()], windSub = new OnePole(55);
  const roarLP = [new OnePole(500), new OnePole(500)];
  const rumLP = new OnePole(40), rumLP2 = new OnePole(70);
  const braamLP = new SVF(), subLP = new OnePole(80);
  const droneLP = [new OnePole(400), new OnePole(400)];
  const riserF = new SVF(), cricketF = new SVF(), meteorF = new SVF();
  const gaspF = [new SVF(), new SVF()];
  const muffL = new OnePole(14000), muffR = new OnePole(14000), cutS = new OnePole(30);
  const revL = new Reverb(11), revR = new Reverb(12);
  const ph = new Float64Array(64);
  let brownL = 0, brownR = 0;

  for (let n = -N0; n < N; n++) {
    const v = n / SR;
    const st = at(n);
    let l = 0, r = 0, wet = 0, dl = 0, dr = 0;      // d*: not muffled in the cutaway
    const cut = cutS.run(v >= V_GROUND && v < V_BACK ? 1 : 0);
    const alive = 1 - st.dead;
    const toWhite = 1 - smooth(T_SWITCH - 0.35, T_SWITCH, v);

    // --- your breathing in the helmet: slow, then fast and ragged after the push, then gone ---
    {
      const panic = smooth(V_JUMP - 0.6, V_JUMP + 0.4, v) * (1 - smooth(V_LAPSE, V_LAPSE + 2, v) * 0.5);
      const cyc = 3.6 - 1.7 * panic;
      ph[0] += 1 / (cyc * SR);
      const p = ph[0] % 1;
      const inh = Math.pow(Math.max(0, Math.sin(p * TAU)), 1.6), exh = Math.pow(Math.max(0, -Math.sin(p * TAU)), 1.2) * 0.8;
      const g = (0.07 + 0.09 * panic) * alive * (1 - smooth(V_O2 - 0.3, V_O2 + 0.4, v) * 0.6);
      const w = white();
      const bv = (breathF[0].run(w, 900 + 500 * inh, 0.5).bp * inh + breathF[1].run(w, 500 + 200 * exh, 0.6).bp * exh * 1.3) * g;
      const x = breathLP.run(bv);
      l += x; r += x * 0.95;
      // the last gasps as the air runs out
      const gk = smooth(V_O2 - 1.6, V_O2 - 1.2, v) * (1 - smooth(V_O2 + 1.4, V_O2 + 2.0, v));
      if (gk > 0) {
        const gp = ((v - V_O2 + 1.6) * 2.3) % 1;
        const ge = Math.pow(Math.max(0, Math.sin(gp * Math.PI)), 2.0) * (1 - 0.5 * smooth(V_O2, V_O2 + 1.4, v));
        const gv = gaspF[0].run(white(), 1200, 0.4).bp * ge * 0.16 * gk;
        l += gv; r += gv;
      }
    }
    // --- the radio: hiss, little crackles, the crew's muffled shouting until the push-off ---
    {
      const rg = 0.012 * (1 - smooth(V_O2 + 1, V_O2 + 3, v));
      const rv = radioLP.run(radioF.run(white(), 2600, 0.4).bp) * rg;
      const cr = crackE.run(white() > 0.9993 ? 1 : 0);
      l += rv * (1 + 14 * cr); r += rv * (1 + 12 * cr) * 0.9;
      const sh = (1 - smooth(V_JUMP + 2.2, V_JUMP + 3.6, v));
      for (const s of shouts) {
        const dt = v - s.t;
        if (dt > 0 && dt < s.d) {
          s.ph += s.f * (1.15 - 0.25 * dt / s.d + 0.03 * Math.sin(dt * 25)) / SR;
          const src = saw(s.ph);
          const vv = (s.fA.run(src, 600 + 250 * s.vow, 0.3).bp + 0.5 * s.fB.run(src, 1100 + 500 * s.vow, 0.3).bp) * Math.sin(Math.PI * dt / s.d) * 0.03 * sh;
          l += vv * 0.9; r += vv; wet += vv * 0.4;
        }
      }
    }
    // --- the fists on the glass: low soft thumps through the hull ---
    for (const b of bangs) {
      const dt = v - b.t;
      if (dt > 0 && dt < 0.35) {
        b.ph += (b.f + 40 * Math.exp(-dt * 25)) / SR;
        const vv = (Math.sin(TAU * b.ph) * 0.7 + b.lp.run(white()) * 1.2) * env(dt, 0.012, 0.07) * b.g;
        l += vv * 0.8; r += vv; wet += vv * 0.3;
      }
    }
    // --- the scream (the owner's clip) ---
    if (SC) {
      const i = Math.round((v - SCREAM_AT) * SR);
      if (i >= 0 && i < SC.a.length) {
        const fade = Math.min(1, i / (0.01 * SR), (SC.a.length - i) / (0.05 * SR));
        const s = SC.a[i] * SC.g * fade;
        l += s * 0.9; r += s * 1.0; wet += s * 0.25;
      }
    }
    // --- the beats: a trailer braam with a sub drop ---
    {
      let braam = 0, sub = 0;
      for (const h of HITS) {
        const dt = v - h.t;
        if (dt < -0.02 || dt > 5) continue;
        const e = env(dt + 0.02, 0.025, 0.9 + 0.8 * h.k) * h.k * (1 - smooth(3.5, 5, dt));
        const hf = h.root * (1 - 0.04 * Math.min(dt, 1));
        ph[10] += hf / SR; ph[11] += hf * 1.005 / SR; ph[12] += hf * 2 / SR; ph[13] += hf * 3.01 / SR;
        braam += (saw(ph[10]) + saw(ph[11]) + 0.5 * saw(ph[12]) + 0.25 * saw(ph[13])) * e;
        ph[14] += (28 + 40 * Math.exp(-Math.max(dt, 0) * 5)) / SR;
        sub += Math.sin(TAU * ph[14]) * env(dt + 0.02, 0.012, 0.7 + 0.5 * h.k) * h.k;
      }
      const bf = braamLP.run(braam, 1400, 0.6).lp * 0.1;
      const sv = subLP.run(sub) * 0.5 + sub * 0.25;
      dl += bf + sv; dr += bf * 0.97 + sv; wet += bf * 0.6;
    }
    // --- the sunrises: a soft bright whoosh each ---
    for (const t of rises) {
      const dt = v - t;
      if (dt > -0.25 && dt < 0.6) {
        const k = (dt + 0.25) / 0.85;
        const vv = riseF.run(white(), 500 + 2500 * k, 0.5).bp * Math.sin(Math.PI * k) * 0.035;
        l += vv; r += vv * 0.9; wet += vv * 0.8;
      }
    }
    // --- the suit's low-oxygen alarm: two soft beeps, faster, then a long flat tone that dies away ---
    {
      const a = smooth(11.4, 11.6, v) * (1 - smooth(V_O2, V_O2 + 0.05, v));
      if (a > 0) {
        const per = 0.75 - 0.3 * smooth(11.5, V_O2, v);
        const cyc = ((v - 11.5) % per + per) % per;
        ph[20] += 1760 / SR;
        const bv = beepLP.run(Math.sin(TAU * ph[20]) * env(cyc, 0.01, 0.07)) * 0.045 * a;
        l += bv * 0.9; r += bv; wet += bv * 0.4;
      }
      const flat = smooth(V_O2, V_O2 + 0.03, v) * (1 - smooth(V_O2 + 1.2, V_O2 + 2.6, v));
      if (flat > 0) { ph[21] += 1320 / SR; const fv = beepLP.run(Math.sin(TAU * ph[21])) * 0.035 * flat; l += fv; r += fv * 0.9; wet += fv * 0.5; }
    }
    // --- your heartbeat from the lapse on, racing with the alarm, then stopping ---
    {
      const hk = smooth(V_LAPSE - 0.5, V_LAPSE + 0.5, v) * (1 - smooth(V_O2 + 0.9, V_O2 + 1.3, v));
      if (hk > 0) {
        const bpm = 70 + 60 * smooth(10.5, V_O2, v);
        ph[22] += bpm / 60 / SR;
        const p = ph[22] % 1;
        const beat = env(p, 0.01, 0.055) + 0.6 * env(p - 0.18, 0.01, 0.05);
        ph[23] += 48 / SR;
        const hv = heartLP.run(Math.sin(TAU * ph[23]) * beat + white() * beat * 0.4) * 0.5 * hk;
        dl += hv; dr += hv;
      }
    }
    // --- the drone: a dark minor pad, sinking as the fall goes on ---
    {
      const ch = chordAt(v);
      const dg = (0.035 + 0.03 * smooth(V_LAPSE, V_O2, v) + 0.04 * smooth(V_DROP, V_GLOW, v)) * toWhite * (1 - 0.6 * smooth(V_FIRE, V_FIRE + 2, v));
      let a = 0, b = 0;
      ch.forEach((f, q) => { ph[40 + q] += f / SR; ph[44 + q] += f * 1.004 / SR; a += saw(ph[40 + q]); b += saw(ph[44 + q]); });
      const cutf = 260 + 500 * smooth(V_DROP, V_FIRE, v);
      droneLP[0].set(cutf); droneLP[1].set(cutf * 1.07);
      const xl = droneLP[0].run(a) * dg, xr = droneLP[1].run(b) * dg;
      dl += xl; dr += xr; wet += (xl + xr) * 0.6;
    }
    // --- the air: a hiss that becomes a roar and a deep rumble, growing with the glow ---
    {
      const g = clamp(st.glow, 0, 1.3);
      const wl = (0.02 * smooth(V_DROP + 4, V_GLOW, v) + 0.3 * Math.pow(g, 1.3)) * toWhite;
      if (wl > 1e-4) {
        const wn = white();
        const gust = 0.75 + 0.25 * Math.sin(v * 1.9) * Math.sin(v * 4.3 + 1);
        const fc = 250 + 900 * g;
        const a = windF[0].run(wn, fc, 0.7).bp, b = windF[1].run(wn, fc * 2.3, 0.9).bp * 0.5, lo = windSub.run(white()) * 2.2;
        const flutter = 1 + 0.2 * g * Math.sin(v * 11.3) * Math.sin(v * 3.7);
        l += (a + b + lo) * wl * gust * flutter; r += (windF[2].run(wn, fc * 1.1, 0.7).bp + b + lo) * wl * gust * flutter;
        const rum = (rumLP.run(white()) * 3 + rumLP2.run(white()) * 2) * 0.25 * g * toWhite;
        dl += rum; dr += rum;
      }
    }
    // --- the fire's crackle: soft filtered puffs ---
    for (const p of puffs) {
      const dt = v - p.t;
      if (dt > 0 && dt < p.d) {
        const vv = p.lp.run(white()) * env(dt, 0.008, p.d * 0.4) * p.g * 0.09 * clamp(st.glow - 0.35, 0, 1) * toWhite;
        l += vv * (1 - p.pan) * 0.5; r += vv * (1 + p.pan) * 0.5;
      }
    }
    // --- parts tearing off: whooshes ---
    for (const w of tears) {
      const dt = v - w.t;
      if (dt > 0 && dt < w.d) {
        const k = dt / w.d;
        const vv = w.f.run(white(), 400 + 2200 * k, 0.6).bp * Math.sin(Math.PI * k) * 0.14;
        l += vv * 0.7; r += vv; wet += vv * 0.4;
      }
    }
    // --- the ground at dusk: crickets, the meteor's far hiss, a gasp ---
    {
      const gk = smooth(V_GROUND - 0.05, V_GROUND + 0.1, v) * (1 - smooth(V_BACK - 0.05, V_BACK + 0.1, v));
      if (gk > 0) {
        const cp = ((v * 14) % 1 + 1) % 1;
        const ce = Math.exp(-cp * 18) * smooth(0, 0.02, cp) * (0.6 + 0.4 * Math.sin(v * 2.1));
        ph[30] += 4300 / SR;
        const cv = cricketF.run(Math.sin(TAU * ph[30]), 4300, 0.6).bp * ce * 0.03 * gk;
        const k = (v - V_GROUND) / (V_BACK - V_GROUND);
        const mv = meteorF.run(white(), 1800 - 900 * k, 0.4).bp * 0.03 * smooth(0, 0.3, k) * gk;
        const gp = v - (V_GROUND + 0.35);
        const ga = gp > 0 && gp < 0.4 ? Math.sin(Math.PI * gp / 0.4) : 0;
        ph[31] += 230 * (1 + 0.2 * ga) / SR;
        const gv = (gaspF[1].run(saw(ph[31]), 800, 0.3).bp) * ga * 0.04 * gk;
        dl += cv * 0.8 + mv * 0.6 + gv; dr += cv + mv + gv * 0.9;
      }
    }
    // --- the burst: a deep boom and a riser into the white, cut just inside it ---
    {
      const k = smooth(V_BURST - 1.0, T_SWITCH - 0.05, v) * (1 - smooth(T_SWITCH - 0.05, T_SWITCH + 0.15, v));
      if (k > 0) {
        const rv = riserF.run(white(), 250 + 2800 * k * k, 0.35).bp * k * k * 0.16;
        dl += rv; dr += rv; wet += rv * 0.5;
      }
    }

    // on the ground (the cutaway) the helmet's world goes dull
    const fcm = 14000 * Math.pow(400 / 14000, cut);
    muffL.set(fcm); muffR.set(fcm);
    l = muffL.run(l); r = muffR.run(r);
    const rl = revL.run(wet * 0.5), rr = revR.run(wet * 0.5);
    const outL = l + dl + rl * 0.8, outR = r + dr + rr * 0.8;
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
