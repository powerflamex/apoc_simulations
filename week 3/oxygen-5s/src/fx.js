// Everything soft: the clouds (wisps round the statue, cumulus over the city) that vanish the instant the water in
// them turns to hydrogen; the dust (the statue pouring down, the mountains slumping, the city's blocks collapsing);
// the exploding sea (a wall of fog and seabed racing inland from every shore and from the Lagoa); and at 5.00 s the
// fire, when the oxygen comes back into the hydrogen.
import * as THREE from 'three';
import { makeSmoke } from './smoke.js';
import { SEA, heightAt, waterAt } from './geo.js';
import { reliefOf } from './terrain.js';
import { STATUE } from './statue.js';
import { fallOf } from './timeline.js';
import { rng, smooth, clamp } from './util.js';

export function makeFx(scene, cityB) {
  const clouds = makeSmoke(scene, 400);
  clouds.mat.uniforms.uLight.value.setRGB(1.55, 1.55, 1.6);
  const dust = makeSmoke(scene, 3200);

  // ---------- clouds ----------
  const CL = [];
  {
    const R = rng(77);
    for (let k = 0; k < 70; k++) {   // the wisps that drift past the statue
      const a = R() * Math.PI * 2, d = 60 + Math.pow(R(), 0.7) * 1400;
      CL.push({ x: Math.cos(a) * d - 200, y: 640 + R() * 260, z: Math.sin(a) * d, r: 35 + R() * 110, seed: R(), drift: 3 + R() * 4 });
    }
    for (let c = 0; c < 45; c++) {   // fair-weather cumulus over the city and the sea
      const cx = (R() - 0.3) * 22000, cz = (R() - 0.5) * 22000, n = 3 + Math.floor(R() * 4), s = 200 + R() * 300;
      for (let k = 0; k < n; k++) CL.push({ x: cx + (R() - 0.5) * s * 2, y: 1500 + R() * 400, z: cz + (R() - 0.5) * s * 2, r: s * (0.6 + 0.6 * R()), seed: R(), drift: 2 });
    }
  }

  // ---------- where the sea's explosion starts: points along every shore within ~11 km, and round the Lagoa ----------
  const SH = [];
  {
    const add = (x, z) => {
      if (Math.hypot(x, z) > 11000) return;
      // which way is land: test a few directions
      let nx = 0, nz = 0;
      for (let k = 0; k < 12; k++) { const a = (k / 12) * Math.PI * 2; if (!waterAt(x + Math.cos(a) * 150, z + Math.sin(a) * 150)) { nx += Math.cos(a); nz += Math.sin(a); } }
      const l = Math.hypot(nx, nz);
      if (l < 0.5) return;
      SH.push({ x, z, nx: nx / l, nz: nz / l });
    };
    for (let i = 0; i < SEA.length; i++) {
      const [ax, az] = SEA[i], [bx, bz] = SEA[(i + 1) % SEA.length];
      const L = Math.hypot(bx - ax, bz - az), n = Math.ceil(L / 260);
      for (let k = 0; k < n; k++) add(ax + (bx - ax) * (k / n), az + (bz - az) * (k / n));
    }
    for (let k = 0; k < 36; k++) { const a = (k / 36) * Math.PI * 2; add(300 + Math.cos(a) * 1060, 2350 + Math.sin(a) * 860); }
  }

  // ---------- dust sources ----------
  const MD = [];   // mountain slopes
  {
    const R = rng(91);
    for (let x = -4000; x <= 7000; x += 280) for (let z = -3500; z <= 5000; z += 280) {
      const px = x + (R() - 0.5) * 200, pz = z + (R() - 0.5) * 200;
      if (waterAt(px, pz)) continue;
      const h = heightAt(px, pz), rel = reliefOf(Math.hypot(px, pz), h);
      if (rel < 0.35 || Math.hypot(px, pz) < 900) continue;   // (none right round the summit: it would hide the view)
      MD.push({ x: px, z: pz, h, rel, seed: R() });
    }
  }
  const CD = [];   // the city's blocks (a sample of them)
  {
    const R = rng(92);
    for (const b of cityB) if (R() < 0.08) CD.push(b);
  }

  return {
    clouds, dust,
    frame(v, s, sunDir) {
      const t = s.t;
      for (const sm of [clouds, dust]) { sm.mat.uniforms.uTime.value = t * 3; sm.mat.uniforms.uSun.value.copy(sunDir); }
      clouds.begin(); dust.begin();
      // clouds: gone in the first tenth of a second (the water in them is hydrogen now, and invisible)
      if (s.clouds > 0.001) for (const c of CL) {
        const k = s.clouds;
        clouds.puff(c.x + c.drift * t * 12, c.y, c.z, c.r * (0.6 + 0.4 * k), 0.55 * k * k, 1.0, 0, c.seed);
      }
      // the statue pouring down: dust streaming off its falling surface and billowing from the heap
      const H = STATUE.ped + STATUE.h, base = STATUE.base - s.sink;
      if (t > 0) {
        const fall = fallOf(t), landed = clamp(fall / H);
        const R = rng(5);
        for (let k = 0; k < 40; k++) {
          const u = R(), a = R() * 6.28, seed = R();
          const y = base + Math.max(0, H - fall) * u;
          const rr = 3 + 2 * R();
          const al = 0.25 * smooth(0, 0.6, t) * (0.4 + 0.6 * landed);
          dust.puff(Math.cos(a) * rr, y + R() * 2, Math.sin(a) * rr * 0.8, 2.5 + 3 * R() + 4 * landed, al, 0.75, 0, seed);
        }
        for (let k = 0; k < 24; k++) {   // the heap's cloud
          const a = R() * 6.28, d = R() * (6 + 12 * landed), seed = R();
          dust.puff(Math.cos(a) * d, base + 2 + R() * 10 * landed, Math.sin(a) * d, 4 + 8 * landed * R(), 0.35 * landed, 0.72, 0, seed);
        }
      }
      // the mountains slumping: dust boiling up off the slopes
      if (s.rock > 0.01) for (const m of MD) {
        const y = m.h - s.sink * m.rel;
        const r = 30 + 60 * s.rock * (0.5 + m.seed);
        dust.puff(m.x, y + r * 0.4, m.z, r, 0.1 * s.rock * m.rel, 0.85, 0, m.seed);
      }
      // the city's blocks collapsing: a dust cloud over each as it comes down, spreading after
      if (t > 0) {
        const fall = fallOf(t);
        for (const b of CD) {
          const done = clamp(fall / b.h);
          const left = Math.max(b.h - fall, 3);
          const r = 10 + b.w * 0.4 + 25 * done + 10 * t;
          dust.puff(b.x, b.y + left * 0.8 + r * 0.3, b.z, r, 0.22 * smooth(0, 0.15, done), 0.85, 0, b.seed);
        }
      }
      // the sea exploding: a wall of fog and seabed rolling in from every shore; on fire at 5.00 s
      if (t > 0) {
        const front = s.sea, wall = s.wall;
        const R = rng(17);
        for (const p of SH) {
          for (let k = 0; k < 3; k++) {
            const back = k * 220;
            const d = Math.max(0, front - back);
            const x = p.x + p.nx * d, z = p.z + p.nz * d;
            const g = heightAt(x, z);
            for (let j = 0; j < 2; j++) {
              const r = Math.max(60, wall * (0.35 + 0.2 * j)) * (0.8 + 0.4 * R());
              const y = Math.max(g, 0) + wall * (0.3 + 0.55 * j) * (1 - 0.25 * k);
              const fire = s.ignite * (1.6 + 0.8 * R());
              dust.puff(x, y, z, r, 0.55 * smooth(0, 0.25, t) * (1 - 0.25 * k), 0.92 - 0.2 * j * (1 - s.ignite), fire, R());
            }
          }
        }
      }
      clouds.end(); dust.end();
    },
  };
}
