// What every bounce throws at the city (all pure functions of the time since that bounce):
//   the flash (a point light, a glow), a shock bubble racing out, a ring of dust rolling along the streets,
//   a column of dust (a mushroom cloud for the big ones), a fireball after a landing from space,
//   chunks of asphalt and rock thrown out of the crater (they stay where they land: the rubble builds up),
//   sparks, the burst water main (a geyser in the crater for a few jumps), glass glittering down off the towers.
import * as THREE from 'three';
import { BOUNCES, jumpOf } from './timeline.js';
import { rng, smooth, clamp } from './util.js';

const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), pos = new THREE.Vector3(), sc = new THREE.Vector3();
const HIDE = new THREE.Matrix4().makeScale(0, 0, 0);
const col = new THREE.Color();
const G = 9.8;

export const V_MAIN0 = jumpOf(11).t0, V_MAIN1 = jumpOf(15).t0;    // the water main is open between these

export function makeBlasts(scene, glassFrom) {
  // ---------- chunks ----------
  const CH = [];
  const R = rng(9090);
  for (const b of BOUNCES) {
    const c = Math.cbrt(Math.max(b.Y, 1e-4));
    const n = Math.round(clamp(10 + 9 * c, 10, 70));
    const reach = b.crater * 3 + 6 + 8 * c;
    for (let k = 0; k < n; k++) {
      const a = R() * Math.PI * 2, el = (30 + R() * 45) * Math.PI / 180;
      const range = reach * (0.2 + 0.8 * Math.pow(R(), 0.7));
      const sp = Math.sqrt(range * G / Math.sin(2 * el));
      const size = (0.12 + 0.5 * R()) * (0.6 + 0.35 * c);
      const r0 = b.crater * Math.sqrt(R());
      const kind = R();
      CH.push({ v: b.v, x: Math.cos(a) * r0, z: Math.sin(a) * r0, vx: Math.cos(a) * sp * Math.cos(el), vz: Math.sin(a) * sp * Math.cos(el), vy: sp * Math.sin(el),
        sz: [size * (0.8 + R() * 0.8), size * (0.3 + R() * 0.4), size * (0.7 + R() * 0.8)], spin: (R() - 0.5) * 14, seed: R(), hot: b.hot,
        c: kind < 0.45 ? 0x1c1c1e : kind < 0.8 ? 0x8b857c : 0x6b5440 });
    }
  }
  const chunkMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 });
  const chunks = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), chunkMat, CH.length);
  chunks.frustumCulled = false;
  CH.forEach((c, i) => { chunks.setColorAt(i, col.set(c.c)); chunks.setMatrixAt(i, HIDE); });
  scene.add(chunks);

  // ---------- the shock bubble ----------
  const shockU = { uA: { value: 0 } };
  const shock = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 32, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.ShaderMaterial({
    uniforms: shockU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    vertexShader: /* glsl */ `varying vec3 vN; varying vec3 vW;
      #include <common>
      #include <logdepthbuf_pars_vertex>
      void main(){ vN = normalize(mat3(modelMatrix) * normal); vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w;
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: /* glsl */ `uniform float uA; varying vec3 vN; varying vec3 vW;
      #include <common>
      #include <logdepthbuf_pars_fragment>
      void main(){
        #include <logdepthbuf_fragment>
        float edge = pow(1.0 - abs(dot(normalize(vN), normalize(cameraPosition - vW))), 4.0);
        gl_FragColor = vec4(vec3(0.9, 0.85, 0.8) * edge * uA, 1.0);
      }`,
  }));
  shock.frustumCulled = false;
  scene.add(shock);

  // ---------- the flash: a light over the crater ----------
  const light = new THREE.PointLight(0xff7a3a, 0, 0, 1.8);
  light.position.set(5, 3.5, 8);   // off your path (you fly straight up through x = z = 0)
  scene.add(light);

  return {
    chunks, shock, light,
    frame(v, s, smoke, glows, camPos) {
      // chunks: fly out, land, stay
      for (let i = 0; i < CH.length; i++) {
        const c = CH[i];
        const dt = v - c.v;
        if (dt < 0) { chunks.setMatrixAt(i, HIDE); continue; }
        const tg = 2 * c.vy / G;
        const t = Math.min(dt, tg);
        const x = c.x + c.vx * t, z = c.z + c.vz * t;
        const y = Math.max(c.sz[1] * 0.5, c.vy * t - 0.5 * G * t * t + 0.1);
        const sp = c.spin * Math.min(dt, tg);
        e.set(c.seed * 6 + sp, c.seed * 3 + sp * 0.6, c.seed * 9 + sp * 0.3);
        q.setFromEuler(e);
        m4.compose(pos.set(x, y, z), q, sc.set(c.sz[0], c.sz[1], c.sz[2]));
        chunks.setMatrixAt(i, m4);
        // hot rock glows while it flies and for a moment after
        if (c.hot > 0.2 && dt < tg + 1.5) {
          const g = c.hot * (dt < tg ? 1 : Math.exp(-(dt - tg) / 0.5));
          glows.add(x, y, z, 0.4 + c.sz[0] * 1.2, 2.5 * g, 0.9 * g, 0.22 * g);
        }
      }
      chunks.instanceMatrix.needsUpdate = true;

      let flash = 0;
      shock.visible = false;
      for (const b of BOUNCES) {
        const age = v - b.v;
        if (age < 0 || age > 9) continue;
        const c = Math.cbrt(Math.max(b.Y, 1e-4));
        const Rb = rng(Math.round(b.v * 1000));
        // the flash
        const f = (0.6 * Math.max(c - 1, 0) + 2 * b.hot) * Math.exp(-age / (0.05 + 0.08 * b.hot));
        flash += f;
        if (age < 0.6) {
          const k = Math.exp(-age / 0.07) * clamp(c - 0.6);
          glows.add(0, 1.5, 0, 2.5 + 3 * c + 10 * b.hot, 2 * k * (0.4 + b.hot), 1.5 * k * (0.4 + b.hot), 1.0 * k * (0.4 + b.hot));
        }
        // the shock bubble (the newest bounce only)
        if (age < 0.55 && b.Y > 0.15) {
          const rs = (b.ring * 1.6) * (1 - Math.exp(-age / 0.18));
          const inside = smooth(rs * 0.6, rs * 1.05, camPos.length());
          shock.visible = inside > 0.01;
          shock.scale.setScalar(Math.max(rs, 0.1));
          shockU.uA.value = Math.min(0.6, 0.2 + 0.12 * c) * (1 - smooth(0.1, 0.55, age)) * smooth(0, 0.03, age) * inside;
        }
        // the dust ring rolling out along the ground
        if (age < 5) {
          const rr = b.ring * (1 - Math.exp(-age / 0.55));
          const n = 34;
          for (let k = 0; k < n; k++) {
            const a = (k / n) * Math.PI * 2 + Rb() * 0.2, seed = Rb();
            const rk = rr * (0.85 + 0.3 * Rb());
            const r = (1.2 + 0.09 * rk) * (0.7 + 0.6 * seed) * (0.6 + 0.4 * c);
            const al = 0.28 * smooth(0, 0.08, age) * (1 - smooth(1.2, 4, age)) * clamp(0.3 + 0.3 * c);
            smoke.puff(Math.cos(a) * rk, r * 0.55, Math.sin(a) * rk, r, al, 0.32 + 0.12 * seed, 0.25 * b.hot * Math.exp(-age / 0.5), seed);
          }
        }
        // the column of dust (and for the big ones, a mushroom cap)
        if (age < 8) {
          const n = 8 + Math.round(6 * Math.min(c, 4));
          for (let k = 0; k < n; k++) {
            const seed = Rb(), u = k / n;
            const rise = (3 + 9 * c) * (1 - Math.exp(-age / ((0.4 + 0.8 * u) * (1 - 0.6 * b.hot)))) * (0.3 + u * 1.4) * (1 + 1.5 * b.hot);
            const r = (0.8 + (1.2 - 0.5 * b.hot) * c) * (0.6 + 0.8 * u) * (1 + age * 0.35);
            const ox = (Rb() - 0.5) * r, oz = (Rb() - 0.5) * r;
            const cap = u > 0.75 && c > 3 ? 1 : 0;
            const capR = cap ? (2 + 2.5 * c) * (1 - Math.exp(-age / 1.2)) : 0;
            const ang = Rb() * 6.28;
            const al = 0.3 * smooth(0, 0.1, age) * (1 - smooth(2.5, 7, age)) * (1 - 0.85 * b.hot) * clamp(0.25 + 0.5 * c);
            smoke.puff(ox + Math.cos(ang) * capR, Math.max(r * 0.5, rise), oz + Math.sin(ang) * capR, r + cap * capR * 0.4, al * (1 - 0.35 * b.hot), (0.35 + 0.2 * seed) * (1 - 0.5 * b.hot), 0.3 * b.hot * Math.exp(-age / 0.8) * (1 - u * 0.8), seed);
          }
        }
        // the fireball after a landing from space
        if (b.hot > 0.05 && age < 2.5) {
          const n = 16;
          for (let k = 0; k < n; k++) {
            const seed = Rb(), a = Rb() * 6.28, el = Rb() * 1.4;
            // the fireball: a ball of burning gas that balloons and climbs fast, going dark as it cools
            const rr = (2 + 1.6 * c) * (1 - Math.exp(-age / 0.2)) * (0.5 + 0.5 * seed);
            const r = (2 + 1.1 * c) * (0.6 + 0.6 * seed) * (0.7 + age * 0.8);
            const lift = 3 + (8 + 4 * c) * age + 6 * age * age;
            smoke.puff(Math.cos(a) * Math.cos(el) * rr, lift + Math.sin(el) * rr, Math.sin(a) * Math.cos(el) * rr, r, 0.55 * b.hot * (1 - smooth(0.6, 2.4, age)), 0.1, 1.4 * Math.exp(-age / 0.35), seed);
          }
        }
        // sparks and hot grit
        if (age < 1.5 && (b.hot > 0.05 || b.Y > 0.3)) {
          const n = Math.round(14 + 16 * b.hot);
          for (let k = 0; k < n; k++) {
            const a = Rb() * 6.28, el = 0.3 + Rb() * 1.1, sp = (10 + 30 * Rb()) * (0.5 + 0.3 * c);
            const t = age;
            const x = Math.cos(a) * Math.cos(el) * sp * t, z = Math.sin(a) * Math.cos(el) * sp * t, y = Math.sin(el) * sp * t - 4.9 * t * t;
            if (y < 0) continue;
            const g = Math.exp(-t / 0.5);
            glows.add(x, y + 0.5, z, 0.3 + 0.08 * c, 4 * g, 1.6 * g, 0.4 * g);
          }
        }
      }
      light.intensity = flash * 1400;
      // the fires burning in the crater after the hot landings
      if (s.bounce && s.bounce.hot > 0.05) {
        const age = s.sinceB;
        const hot = s.bounce.hot * (0.5 + 0.5 * Math.exp(-age / 1.2));
        light.intensity += hot * 220 * (0.85 + 0.15 * Math.sin(v * 13));
      }

      // the burst water main: a white geyser out of the crater between bounces, until it boils away
      if (v > V_MAIN0 + 0.2 && v < V_MAIN1) {
        const on = smooth(V_MAIN0 + 0.2, V_MAIN0 + 0.8, v) * (1 - smooth(V_MAIN1 - 0.6, V_MAIN1, v)) * (s.y > 3 ? 1 : 0.3);
        const Rg = rng(777);
        for (let k = 0; k < 26; k++) {
          const ph = (v * (0.9 + 0.3 * Rg()) + Rg()) % 1, seed = Rg();
          const y = 1 + ph * 16, r = 0.6 + ph * 3.2;
          smoke.puff(1.2 + (Rg() - 0.5) * ph * 4, y, 0.8 + (Rg() - 0.5) * ph * 4, r, 0.35 * on * Math.sin(Math.PI * ph), 0.98, 0, seed);
        }
        for (let k = 0; k < 60; k++) {
          const ph = (v * (1.1 + 0.4 * Rg()) + Rg()) % 1, a = Rg() * 6.28, sp = 2 + 4 * Rg();
          const t = ph * 1.8;
          const y = 14 * t - 4.9 * t * t;
          if (y < 0) continue;
          glows.add(1.2 + Math.cos(a) * sp * t, y, 0.8 + Math.sin(a) * sp * t, 0.25, 0.6 * on, 0.75 * on, 0.9 * on);
        }
      }

      // glass glittering down off the towers
      for (let i = 0; i < glassFrom.length; i++) {
        const g = glassFrom[i];
        const dt = v - g.v;
        if (dt < 0 || dt > 6) continue;
        const out = 3 + 6 * g.seed;
        const t = dt;
        const y = g.y - 0.5 * G * t * t + 2 * t;
        if (y < 0.2) continue;
        const ox = g.out === 0 ? -1 : g.out === 1 ? 1 : 0, oz = g.out === 2 ? 1 : g.out === 3 ? -1 : 0;
        const tw = 0.5 + 0.5 * Math.sin(v * (30 + 40 * g.seed) + g.seed * 100);
        const b = (0.5 + 2.2 * tw * tw * tw) * (1 - smooth(4, 6, dt)) * (1 + 3 * Math.exp(-dt / 0.15));
        glows.add(g.x + ox * out * t, y, g.z + oz * out * t, 0.9 + 0.9 * g.seed, b * 0.7, b * 0.78, b * 0.85);
      }
    },
  };
}
