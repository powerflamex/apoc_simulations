// Effects on the street, all functions of time (every particle's path is worked out from its launch):
//   the crater at P (one crater that snaps bigger at each push-off and landing) and its cracks; chunks of asphalt and
//   dust at each one; the glass that bursts out of the facades when a blast front passes (from 100,000x on); the white
//   streak you leave going up (1,000,000x and on); the hole you punch in the cloud deck; the fireball coming down at
//   1,000,000x; the push-off fireballs from 1 ton up (orange, then a dark rising column, mushroom caps from 750 tons).
import * as THREE from 'three';
import { EVENTS, craterAt, front, GLASS_V } from './events.js';
import { JUMPS } from './timeline.js';
import { timeAtHeight } from './choreo.js';
import { P, A, WALK, CLOUD_Y } from './layout.js';
import { smooth, clamp, lerp, rng } from './util.js';

const G = 9.81;
export const HOLE_T = timeAtHeight(JUMPS[3], CLOUD_Y);
// the 1,000,000x fall as seen from the street: a fireball sliding down the sky onto P (from the north-north-west)
export const FALL = { t0: 21.25, t1: JUMPS[5].l, from: new THREE.Vector3(P.x + 900, 5200, P.z - 5200) };
export function fallPos(v, out = new THREE.Vector3()) {
  const k = clamp((v - FALL.t0) / (FALL.t1 - FALL.t0));
  const e = Math.pow(k, 1.6);
  return out.set(lerp(FALL.from.x, P.x, e), lerp(FALL.from.y, 0.5, e), lerp(FALL.from.z, P.z, e));
}

export function makeFx(scene, ctx, { smoke, glows }) {
  const R = rng(9090);
  // ---- chunks: instanced boxes (asphalt, glass) ----
  const MAXC = 3000;
  const chunks = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), ctx.plainMat(0xffffff, 0.6), MAXC);
  chunks.castShadow = true; chunks.receiveShadow = true; chunks.frustumCulled = false;
  scene.add(chunks);
  const col = new THREE.Color();
  for (let i = 0; i < MAXC; i++) chunks.setColorAt(i, col.setRGB(1, 1, 1));
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), sc = new THREE.Vector3();
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  let nc = 0;
  const chunk = (x, y, z, s, rx, ry, rz, r, g, b, flat = 0.55) => {
    if (nc >= MAXC || s <= 0.002) return;
    chunks.setMatrixAt(nc, m4.compose(p.set(x, y, z), q.setFromEuler(e.set(rx, ry, rz)), sc.set(s, s * flat, s * 0.8)));
    chunks.setColorAt(nc, col.setRGB(r, g, b));
    nc++;
  };
  // ---- fireballs: a billowing ball per big push-off, bright yellow-white in the middle, orange at the edge, cooling to
  //      dark smoke as it rises (opaque, so it reads as a solid ball even from far down the avenue) ----
  const FIRE = EVENTS.filter((e) => e.fire);
  const fbMat = () => new THREE.ShaderMaterial({
    uniforms: { uHeat: { value: 1 }, uT: { value: 0 }, uSeed: { value: 0 } },
    vertexShader: /* glsl */ `uniform float uT; uniform float uSeed; varying vec3 vN; varying vec3 vV; varying vec3 vO;
      #include <common>
      #include <logdepthbuf_pars_vertex>
      float hh(vec3 p){ p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
      float nn(vec3 p){ vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(mix(hh(i), hh(i + vec3(1,0,0)), f.x), mix(hh(i + vec3(0,1,0)), hh(i + vec3(1,1,0)), f.x), f.y),
                   mix(mix(hh(i + vec3(0,0,1)), hh(i + vec3(1,0,1)), f.x), mix(hh(i + vec3(0,1,1)), hh(i + vec3(1,1,1)), f.x), f.y), f.z); }
      void main(){
        vO = position;
        float b = nn(position * 2.2 + vec3(uSeed, uT * 0.6, 0.0)) * 0.6 + nn(position * 5.0 - vec3(0.0, uT, uSeed)) * 0.4;
        vec3 p = position * (0.82 + 0.36 * b);
        vec4 w = modelMatrix * vec4(p, 1.0);
        vN = normalize(mat3(modelMatrix) * normal); vV = normalize(cameraPosition - w.xyz);
        gl_Position = projectionMatrix * viewMatrix * w;
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: /* glsl */ `uniform float uHeat; uniform float uT; uniform float uSeed; varying vec3 vN; varying vec3 vV; varying vec3 vO;
      #include <common>
      #include <logdepthbuf_pars_fragment>
      float hh(vec3 p){ p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
      float nn(vec3 p){ vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(mix(hh(i), hh(i + vec3(1,0,0)), f.x), mix(hh(i + vec3(0,1,0)), hh(i + vec3(1,1,0)), f.x), f.y),
                   mix(mix(hh(i + vec3(0,0,1)), hh(i + vec3(1,0,1)), f.x), mix(hh(i + vec3(0,1,1)), hh(i + vec3(1,1,1)), f.x), f.y), f.z); }
      void main(){
        #include <logdepthbuf_fragment>
        float f = abs(dot(normalize(vN), normalize(vV)));
        float n = nn(vO * 4.0 + vec3(uSeed, -uT * 1.2, 0.0)) * 0.6 + nn(vO * 11.0 + vec3(0.0, -uT * 2.0, uSeed)) * 0.4;
        // billows: bright where the noise is high and the surface faces you, dark red-brown in the folds and at the edge
        float hot = clamp(uHeat * (0.15 + 1.1 * pow(f, 0.8)) * (0.25 + 1.3 * n * n), 0.0, 1.6);
        vec3 smoke = vec3(0.13, 0.1, 0.085) * (0.5 + 0.9 * n);
        vec3 fire = mix(vec3(0.75, 0.13, 0.02), vec3(1.25, 0.5, 0.08), smoothstep(0.25, 0.7, hot));
        fire = mix(fire, vec3(1.45, 1.1, 0.6), smoothstep(0.8, 1.35, hot));
        vec3 c = mix(smoke, fire, smoothstep(0.08, 0.45, hot));
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const balls = FIRE.map((e, i) => {
    const m = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 5), fbMat());
    m.material.uniforms.uSeed.value = i * 7.3;
    m.frustumCulled = false; m.visible = false; m.renderOrder = 4;
    scene.add(m);
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.85, 1, 24, 6).translate(0, 0.5, 0), fbMat());
    stem.material.uniforms.uSeed.value = i * 3.1 + 1;
    stem.frustumCulled = false; stem.visible = false; stem.renderOrder = 4;
    scene.add(stem);
    return { e, m, stem };
  });
  const BURSTS = [];
  const burst = (t0, x, y, z, n, v, s, c, o = {}) => BURSTS.push({ t0, x, y, z, n, v, s, c, seed: R() * 1000, up: o.up ?? 0.8, dir: o.dir || null, spread: o.spread ?? 1, life: o.life ?? 6, flat: o.flat ?? 0.55 });
  const pave = [0.36, 0.35, 0.34];
  for (const ev of EVENTS) {
    const big = ev.crater[0];
    if (ev.N < 50) { burst(ev.t, ev.x, 0.05, ev.z, 10, 2.2, 0.05, pave, { up: 1.4 }); continue; }
    burst(ev.t, ev.x, 0.1, ev.z, Math.round(Math.min(160, 14 + big * 18)), 3 + big * 3.5, 0.06 + big * 0.05, pave, { up: 1.3 });
  }
  // glass: from 100,000x on, every window the front passes bursts out into the street (both sides, along the avenue)
  for (const ev of EVENTS) {
    if (!ev.glass) continue;
    const reach = Math.min(ev.glass, 420);
    for (let k = 0; k < 120; k++) {
      const sx = k % 2 ? 1 : -1, zz = ev.z + (R() - 0.3) * 1.6 * reach, hy = 3 + 30 * R();
      const d = Math.hypot(sx * WALK - ev.x, zz - ev.z);
      if (d > ev.glass) continue;
      const t = ev.t + d / (GLASS_V + 0.4 * ev.glass);
      burst(t, sx * (WALK - 0.1), hy, zz, 14, 5, 0.16, [0.72, 0.84, 0.9], { up: 0.15, dir: [-sx * 0.9, 0.1, 0], spread: 0.5, flat: 0.08, life: 5 });
    }
  }

  return {
    // ---- the crater and its cracks (GU uniforms) ----
    craters(v, GU) {
      const c = craterAt(v);
      const ck = c.r > 0 ? Math.max(c.r * 4.5, 3) : 0;
      GU.uCr.value[0].set(P.x, P.z, Math.max(c.r, 0.001), c.d);
      GU.uCk.value[0].set(ck, c.r > 0 ? 1 : 0, 1.1, c.r > 0.3 ? 1 : 0.4);
      // the small crack where the 10x jump took off
      const k0 = smooth(JUMPS[0].p, JUMPS[0].p + 0.08, v);
      GU.uCr.value[1].set(A.x, A.z, 0.35, 0.01 * k0);
      GU.uCk.value[1].set(1.6 * k0, k0 > 0 ? 0.7 : 0, 4.8, 0.2 * k0);
    },
    frame(v, o) {
      nc = 0;
      // ---- chunk bursts ----
      for (const b of BURSTS) {
        const t = v - b.t0;
        if (t < 0 || t > b.life) continue;
        const rr = rng(Math.floor(b.seed));
        for (let i = 0; i < b.n; i++) {
          const a = rr() * Math.PI * 2, sp = b.v * (0.35 + 0.65 * rr()), up = b.up * (0.4 + 0.8 * rr());
          let vx = Math.cos(a) * sp * b.spread, vz = Math.sin(a) * sp * b.spread, vy = sp * up;
          if (b.dir) { vx = vx * 0.5 + b.dir[0] * sp; vy += b.dir[1] * sp; vz = vz * 0.5 + b.dir[2] * sp; }
          const s = b.s * (0.4 + 0.9 * rr());
          const tLand = (vy + Math.sqrt(vy * vy + 2 * G * Math.max(0.01, b.y))) / G;
          const tt = Math.min(t, tLand);
          const x = b.x + vx * tt + (t > tLand ? vx * 0.15 * (1 - Math.exp(-(t - tLand) * 4)) : 0);
          const z = b.z + vz * tt + (t > tLand ? vz * 0.15 * (1 - Math.exp(-(t - tLand) * 4)) : 0);
          const y = Math.max(s * 0.25, b.y + vy * tt - 0.5 * G * tt * tt);
          const spin = Math.min(t, tLand + 0.3) * (4 + 6 * rr());
          const sh = 0.85 + 0.3 * rr();
          chunk(x, y, z, s, spin + a, spin * 0.7, spin * 0.3, b.c[0] * sh, b.c[1] * sh, b.c[2] * sh, b.flat);
          // glass glints: shards catching the Sun as they tumble (sparkle sprites, bloomed)
          if (b.flat < 0.1 && i % 2 === 0 && t < tLand + 0.4) { const fl = Math.pow(0.5 + 0.5 * Math.sin(spin * 3 + i), 6); glows.add(x, y, z, 0.5 + 0.6 * fl, 3 * fl + 0.4, 3.2 * fl + 0.45, 3.4 * fl + 0.5); }
        }
      }
      for (let i = nc; i < MAXC; i++) chunks.setMatrixAt(i, zero);
      chunks.instanceMatrix.needsUpdate = true; chunks.instanceColor.needsUpdate = true;

      // ---- dust: a ring bursting out of each push-off and landing, a low cloud left behind ----
      for (const ev of EVENTS) {
        const t = v - ev.t, Rd = ev.dust, life = 3 + Math.sqrt(Rd) * 1.6;
        if (t < 0 || t > life) continue;
        const n = Math.round(Math.min(70, 10 + Rd * 1.2));
        const grow = 1 - Math.exp(-t / (0.25 + Rd * 0.008));
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2 + i * 0.37, f = (i * 0.618) % 1, g = (i * 0.377) % 1;
          const r = Rd * (0.25 + 0.85 * grow) * (0.55 + 0.6 * f);
          const size = (0.35 + 0.22 * Rd) * (0.6 + 0.6 * g) * (0.5 + 0.7 * grow);
          // (low and see-through near you on the small ones, so you stay visible in the crater)
          const near = Rd < 12 ? 0.55 : 1;
          smoke.puff(ev.x + Math.cos(a) * r, size * 0.4 + Rd * 0.1 * g * grow, ev.z + Math.sin(a) * r, size * (Rd < 12 ? 0.8 : 1),
            0.6 * near * smooth(0, 0.1, t) * (1 - smooth(life * 0.4, life, t)), 0.6, 0, f);
        }
      }

      // ---- the cloud deck's hole: torn open when you pass 2 km at 10,000x, bigger at 100,000x ----
      {
        const t1 = v - HOLE_T, t2 = v - timeAtHeight(JUMPS[4], CLOUD_Y);
        let r = 0;
        if (t1 > 0) r = 60 + 190 * (1 - Math.exp(-t1 / 0.35));
        if (t2 > 0) r = Math.max(r, 170 + 330 * (1 - Math.exp(-t2 / 0.6)));
        o.GU.uHole.value.set(P.x, P.z, r, 0);
        // the punch: cloud puffs thrown up round the hole
        if (t1 > 0 && t1 < 4) for (let i = 0; i < 40; i++) {
          const f = (i * 0.618) % 1, g = (i * 0.377) % 1, a = i * 2.4;
          const rr = (20 + 120 * f) * (1 - Math.exp(-t1 / 0.6));
          smoke.puff(P.x + Math.cos(a) * rr, CLOUD_Y + 30 + 260 * g * (1 - Math.exp(-t1 / 0.5)) - 20 * t1, P.z + Math.sin(a) * rr, 30 + 40 * g,
            0.75 * smooth(0, 0.1, t1) * (1 - smooth(2, 4, t1)), 1.0, 0, f);
        }
      }

      // ---- the white streak going up (shock-heated air and dust): 1,000,000x and on ----
      for (const ev of EVENTS) {
        if (!ev.streak && ev.N < 1e7) continue;
        const t = v - ev.t;
        if (t < 0 || t > 4.5) continue;
        // (10,000x and 100,000x: a thin wake of dust and vapour drawn up behind you; from 1,000,000x a white column)
        const thin = ev.N < 1e6 ? 0.35 : 1;
        const top = Math.min(ev.N < 1e5 ? CLOUD_Y : 9000, 22000 * t);
        const n = 110;
        for (let i = 0; i < n; i++) {
          const f = i / n, g = (i * 0.618) % 1;
          const y = 2 + top * Math.pow(f, 1.6);
          const r = (3 + 0.045 * y) * (1 + 0.6 * t) * (0.7 + 0.5 * g) * thin;
          smoke.puff(P.x + (g - 0.5) * r * 0.6, y, P.z + ((i * 0.377) % 1 - 0.5) * r * 0.6, r,
            0.7 * smooth(0, 0.05, t) * (1 - smooth(2.2 * thin, 4.5 * thin, t)) * (1 - 0.5 * f) * (0.4 + 0.6 * thin), 1.0, 0, g);
        }
        if (t < 0.25) glows.add(P.x, 8, P.z, 40 * (1 - t / 0.25) + 8, 14, 12, 10);
      }

      // ---- the 1,000,000x fall: a fireball sliding down the sky, its smoke trail left hanging ----
      {
        if (v > FALL.t0 && v < FALL.t1 + 0.05) {
          const hp = fallPos(v);
          const heat = 1 - smooth(FALL.t1 - 0.05, FALL.t1, v);
          const sz = 70 + 0.03 * hp.y;
          glows.add(hp.x, hp.y, hp.z, sz * 2.2, 9 * heat, 5 * heat, 1.6 * heat);
          glows.add(hp.x, hp.y, hp.z, sz * 0.7, 18 * heat, 16 * heat, 12 * heat);
        }
        const tt = v - FALL.t0;
        if (tt > 0 && tt < 4.5) for (let i = 0; i < 50; i++) {
          const f = i / 50;
          const tb = FALL.t0 + f * (FALL.t1 - FALL.t0);
          if (tb > v) break;
          const pp = fallPos(tb);
          const age = v - tb;
          const r = (25 + 0.006 * pp.y) * (1 + 1.2 * age);
          smoke.puff(pp.x, pp.y, pp.z, r, 0.55 * (1 - smooth(1.5, 4.5, age)), 0.55, age < 0.15 ? 0.9 : 0, f);
        }
      }

      // ---- the fireball meshes: a dome that swells out of the street in a fraction of a second, then rises on a
      //      stem and cools (the biggest ones into a mushroom cap) ----
      for (const B of balls) {
        const e = B.e, t = v - e.t, Rf = e.fire;
        const on = t > 0 && t < 16;
        B.m.visible = on; B.stem.visible = on && Rf >= 90;
        if (!on) continue;
        const grow = 1 - Math.exp(-t / (0.08 + Rf * 0.0012));
        const heat = Math.exp(-t / (0.9 + Rf * 0.012));
        const R = Rf * (0.35 + 0.65 * grow) * (1 + 0.15 * Math.min(t, 6) / 6);
        const lift = Rf * (Rf >= 90 ? 0.9 : 0.5) * (1 - Math.exp(-t / 2.2)) + Rf * 0.12 * t;
        B.m.position.set(e.x, R * 0.35 + lift, e.z);
        const flat = Rf >= 90 ? 1 - 0.35 * smooth(0.5, 4, t) : 1;
        B.m.scale.set(R * (1 + 0.25 * (1 - flat)), R * flat, R * (1 + 0.25 * (1 - flat)));
        B.m.material.uniforms.uHeat.value = heat; B.m.material.uniforms.uT.value = t;
        if (Rf >= 90) {
          const h = R * 0.35 + lift;
          B.stem.position.set(e.x, 0, e.z);
          B.stem.scale.set(R * 0.42 * (0.4 + 0.6 * smooth(0.3, 2.5, t)), Math.max(1, h * smooth(0.2, 1.5, t)), R * 0.42 * (0.4 + 0.6 * smooth(0.3, 2.5, t)));
          B.stem.material.uniforms.uHeat.value = heat * 0.55; B.stem.material.uniforms.uT.value = t;
        }
      }
      // ---- the fireballs of the big push-offs (and the 1,000,000x landing): orange, then a dark column rising,
      //      a mushroom cap on the biggest ----
      for (const ev of EVENTS) {
        if (!ev.fire) continue;
        const t = v - ev.t;
        if (t < 0 || t > 14) continue;
        const Rf = ev.fire;
        const grow = 1 - Math.exp(-t / (0.12 + Rf * 0.0016));
        const heat = Math.exp(-t / (0.9 + Rf * 0.012));
        const rise = Rf * 0.6 * t;
        const n = 46;
        for (let i = 0; i < n; i++) {
          const f = (i * 0.618) % 1, g = (i * 0.377) % 1, a = i * 2.4;
          const rr = Rf * grow * (0.15 + 0.75 * Math.sqrt(f));
          const hy = Rf * grow * (0.15 + 0.6 * g) + rise * (0.4 + 0.6 * g);
          smoke.puff(ev.x + Math.cos(a) * rr, hy, ev.z + Math.sin(a) * rr, Rf * (0.32 + 0.3 * g) * (0.4 + 0.6 * grow),
            0.95 * smooth(0, 0.04, t) * (1 - smooth(9, 14, t)), 0.25 + 0.35 * (1 - heat), 2.2 * heat * (1 - 0.6 * f) + 0.05, f);
        }
        // the cap and stem (750 tons and up)
        if (Rf >= 90) {
          const capY = Rf * (1.0 + 1.6 * (1 - Math.exp(-t / 2.5)));
          for (let i = 0; i < 26; i++) {
            const f = (i * 0.618) % 1, a = i * 2.4;
            const rr = Rf * (0.4 + 0.9 * f) * (1 - Math.exp(-t / 1.6));
            smoke.puff(ev.x + Math.cos(a) * rr, capY + Rf * 0.25 * ((i * 0.377) % 1), ev.z + Math.sin(a) * rr, Rf * 0.5,
              0.85 * smooth(0.3, 1.2, t), 0.35, 0.7 * heat, f);
          }
          for (let i = 0; i < 14; i++) {
            const f = i / 14;
            smoke.puff(ev.x, capY * f, ev.z, Rf * (0.28 + 0.1 * f), 0.8 * smooth(0.2, 1.0, t), 0.3, 0.5 * heat * (1 - f), f);
          }
        }
        // the flash and the core's glow
        glows.add(ev.x, Rf * 0.5 + rise * 0.5, ev.z, Rf * 3.5 * grow + 10, 10 * heat, 7 * heat, 4 * heat);
        if (t < 0.18) glows.add(ev.x, Rf * 0.3, ev.z, Rf * 6 + 60, 30 * (1 - t / 0.18), 28 * (1 - t / 0.18), 26 * (1 - t / 0.18));
        o.fireL.position.set(ev.x, Rf * 0.6, ev.z + Rf);
        o.fireL.intensity = Math.max(o.fireL.intensity, 2.5 * Rf * Rf * heat * smooth(0, 0.05, t));
        o.fireL.distance = Rf * 7;
      }
    },
  };
}
