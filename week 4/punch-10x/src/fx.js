// The blasts themselves (each a pure function of the time since its punch landed):
//   - a flash at your fist and a glassy shock shell racing out from it (every punch)
//   - punches 5-7: a ball of dark dust with a bright rim, thrown forward from the fist and swelling (the look of the
//     air blast in slow motion), with dust rolling along the ground under it
//   - punch 8: a tunnel of dust and shock straight north through the towers
//   - punches 9-16: the blast front: a dome with a bright rim and a wall of dust along the ground where it runs out,
//     ahead of you at first, all round you from punch 12; from punch 12 a fireball and a mushroom cloud
// The ground damage (rubble, scorch, crater) is set here too (ground.js GU).
import * as THREE from 'three';
import { IMP, reachOf, frontTime } from './layout.js';
import { vPunch, flatR, kilotons, N_PUNCH } from './timeline.js';
import { GU } from './ground.js';
import { rng, smooth, clamp, lerp } from './util.js';

// fireball radius and mushroom-cloud height (m) for punch n (W in kilotons)
export const fireR = (n) => 66 * Math.pow(kilotons(n), 0.4);
export const cloudH = (n) => 16000 * Math.pow(kilotons(n) / 120, 0.25);

export function makeFx(scene) {
  // ---------- shock shells: spheres drawn only at their rim (refraction-like bright edge), additive ----------
  const shellMat = new THREE.ShaderMaterial({
    uniforms: { uA: { value: 1 } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.FrontSide,
    vertexShader: /* glsl */ `varying vec3 vN; varying vec3 vV; varying float vA; attribute float aA;
      #include <common>
      #include <logdepthbuf_pars_vertex>
      void main(){ vA = aA; vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0); vN = normalize(mat3(modelMatrix * instanceMatrix) * normal); vV = normalize(cameraPosition - w.xyz);
        gl_Position = projectionMatrix * viewMatrix * w;
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: /* glsl */ `varying vec3 vN; varying vec3 vV; varying float vA;
      #include <common>
      #include <logdepthbuf_pars_fragment>
      void main(){
        #include <logdepthbuf_fragment>
        float f = 1.0 - abs(dot(normalize(vN), vV));
        float rim = pow(f, 6.0) * 0.9 + pow(f, 1.5) * 0.04;
        gl_FragColor = vec4(vec3(1.0, 0.97, 0.92) * rim * vA, 1.0);
      }`,
  });
  const NS = 8;
  const shellGeo = new THREE.SphereGeometry(1, 64, 32);
  const aA = new THREE.InstancedBufferAttribute(new Float32Array(NS), 1);
  shellGeo.setAttribute('aA', aA);
  const shells = new THREE.InstancedMesh(shellGeo, shellMat, NS);
  shells.frustumCulled = false; shells.renderOrder = 7;
  scene.add(shells);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s3 = new THREE.Vector3();
  const R = rng(5);

  // per punch: fixed random numbers for its puffs
  const SEEDS = Array.from({ length: N_PUNCH + 1 }, (_, n) => Array.from({ length: 160 }, () => R()));

  return {
    shells,
    // camD: camera distance from you (puff budgets); returns the strength of the flash this frame (for the post)
    frame(v, smoke, glows, camPos, inCrater = false) {
      let ns = 0, flash = 0;
      const shell = (x, y, z, r, a, flat = 1) => {
        if (ns >= NS || a < 0.003 || r <= 0) return;
        m4.compose(p.set(x, y, z), q.identity(), s3.set(r, r * flat, r));
        shells.setMatrixAt(ns, m4); aA.setX(ns, a); ns++;
      };
      for (let n = 1; n <= N_PUNCH; n++) {
        const t = v - vPunch(n);
        if (t < -0.02 || t > 30) continue;
        const S = SEEDS[n];
        const fx = IMP.x, fy = IMP.y, fz = IMP.z;
        // ---- the flash at your fist (bigger every time) and the glare it throws over the frame ----
        if (t < 0.5 && n <= 16) {
          const k = Math.exp(-Math.max(t, 0) / (0.04 + 0.01 * n)) * smooth(-0.02, 0.0, t);
          const sz = (n <= 4 ? 0.25 + 0.2 * n : 0.6 + 0.5 * n) + (n > 8 ? Math.pow(1.7, n - 8) * 3 : 0);
          glows.add(fx, fy, fz - 0.1, sz, 3.2 * k, 3.0 * k, 2.7 * k);
          flash = Math.max(flash, k * clamp((n - 1) / 10, 0.08, 1));
        }
        // ---- the shock shell from the fist (punches 2-11): fast, then slowing; fading as it goes ----
        if (n >= 6 && n <= 11 && t >= 0 && t < 1.2) {
          const Rmax = n <= 4 ? 3 + 5 * (n - 2) : n <= 8 ? 14 * Math.pow(2.2, n - 5) : reachOf(n, 0) * 0.9;
          const r = Rmax * (1 - Math.exp(-t / 0.18));
          const fwd = n <= 8 ? 0.35 * r : 0;
          shell(fx, fy, fz - fwd, r, (1 - smooth(0.1, 1.1, t)) * (n <= 4 ? 0.7 : 1), n >= 9 ? 0.7 : 1);
        }
        // ---- punches 5-7: the dark dust ball thrown forward from the fist ----
        if (n >= 5 && n <= 7 && t >= 0 && t < 9) {
          const big = [0, 0, 0, 0, 0, 0, 0.8, 1.8][n];
          const ctrZ = fz - (5 + 14 * big) * (1 - Math.exp(-t / 0.35));
          const Rb = (4.5 + 7 * big) * (1 - Math.exp(-t / 0.25)) + t * (0.6 + 0.8 * big);
          const al = smooth(0, 0.05, t) * (1 - smooth(2.0, 6.5, t));
          const np = 46;
          for (let k = 0; k < np; k++) {
            // puffs on and inside a sphere: the outer ones bright (lit dust), the inner ones dark
            const u = S[k] * 2 - 1, a = S[k + 50] * Math.PI * 2, rr = Math.sqrt(1 - u * u);
            const rad = Math.pow(S[k + 100], 0.4);
            const x = fx + Math.cos(a) * rr * Rb * rad, y = Math.max(fy + u * Rb * rad * 0.8 + Rb * 0.25, Rb * 0.25), z = ctrZ + Math.sin(a) * rr * Rb * rad;
            smoke.puff(x, y, z, Rb * (0.3 + 0.18 * S[k + 30]), 0.5 * al, lerp(0.05, 0.6, rad * rad), 0, S[k + 70]);
          }
          // the dust thrown along the ground under it, out to the sides
          for (let k = 0; k < 24; k++) {
            const a = -Math.PI / 2 + (S[k] - 0.5) * 2.6;
            const out = (3 + 10 * big) * (1 - Math.exp(-t / 0.5)) * (0.6 + 0.6 * S[k + 24]);
            const r = 1.0 + big * 1.5 + t * 0.8 * (1 + big);
            smoke.puff(fx + Math.cos(a) * out * 1.3, r * 0.5, fz + Math.sin(a) * out, r, 0.45 * al, 0.6 + 0.15 * S[k + 48], 0, S[k + 90]);
          }
        }
        // ---- punch 8: a tunnel of dust and shock straight through the towers ----
        if (n === 8 && t >= 0 && t < 12) {
          const len = 420 * (1 - Math.exp(-t / 0.18));
          const al = smooth(0, 0.04, t) * (1 - smooth(3, 12, t));
          for (let k = 0; k < 60; k++) {
            const f = k / 60;
            const z = fz - f * len;
            const r = (4 + 14 * f) * (1 + t * 0.6) * (0.7 + 0.5 * S[k]);
            const y = 8 + f * 60 + (S[k + 60] - 0.5) * 20 * f;
            smoke.puff(fx + (S[k + 30] - 0.5) * 18 * f, Math.max(y, r * 0.4), z, r, 0.42 * al, 0.55 + 0.2 * S[k + 90], 0, S[k + 120]);
          }
          if (t < 0.5) for (let k = 0; k < 12; k++) shell(fx, 30 + k * 6, fz - (k + 1) * 34 * Math.min(1, t / 0.3), 10 + 3 * k, 0.5 * (1 - t / 0.5), 0.8);
        }
        // ---- punches 9-16: the blast front, the dome, the fireball and the mushroom cloud ----
        if (n >= 9 && n <= 16 && t >= 0) {
          const T = frontTime(n);
          const f = Math.pow(clamp(t / T), 1 / 0.75);        // how far the front has run (of its full reach)
          const Rn = flatR(n), round = smooth(9.5, 12.5, n);
          const lifeEnd = 14 + 2 * (n - 9);
          if (t < lifeEnd) {
            // the dust wall along the front: dense, tall, rolling; it settles once the front stops
            const np = 110;
            const al = smooth(0, 0.08, t) * (1 - smooth(lifeEnd - 6, lifeEnd, t));
            const puffR = Math.max(6, Rn * 0.07) * (1 + 0.6 * smooth(0, T * 2, t));
            for (let k = 0; k < np; k++) {
              const th = (k / np) * Math.PI * 2 + S[k] * 0.05;
              const reach = reachOf(n, th) * f * (1 + 0.04 * (S[k + 40] - 0.5));
              if (reach < 2) continue;
              const x = fx + Math.sin(th) * reach, z = fz - Math.cos(th) * reach;
              const rr = puffR * (0.7 + 0.6 * S[k + 20]) * (0.6 + 0.4 * reach / (reachOf(n, th) + 1));
              smoke.puff(x, rr * 0.5, z, rr, 0.55 * al, 0.55 + 0.2 * S[k + 60], 0, S[k + 80]);
            }
            // the dome: a glassy shell over the front (an ellipsoid while the blast is still a forward lobe)
            if (t < T * 1.4) {
              const fw = reachOf(n, 0) * f, bk = reachOf(n, Math.PI) * f, sd = reachOf(n, Math.PI / 2) * f;
              const cz = fz - (fw - bk) / 2, rz = (fw + bk) / 2;
              m4.compose(p.set(fx, 0, cz), q.identity(), s3.set(sd, Math.min(rz, sd) * 0.7, rz));
              if (ns < NS) { shells.setMatrixAt(ns, m4); aA.setX(ns, 0.9 * (1 - smooth(T * 0.7, T * 1.4, t))); ns++; }
            }
          }
          // fireball and mushroom cloud (punch 12 on): a glowing ball that rises and turns to smoke, the stem, the cap
          if (n >= 12 && t < 22 && !inCrater) {
            const H = cloudH(n), Rf = fireR(n);
            const hc = H * (1 - Math.exp(-t / 1.1));
            const glowK = Math.exp(-t / 1.2);
            const al = smooth(0, 0.15, t) * (1 - smooth(14, 22, t));
            // the fireball (white-hot, then orange, rising)
            const fy2 = Rf * 0.6 + hc * 0.35 * smooth(0, 1.5, t);
            glows.add(fx, fy2, fz, Rf * (2.6 + 1.5 * (1 - glowK)), 3.0 * glowK + 0.3, 2.2 * glowK + 0.1, 1.2 * glowK);
            for (let k = 0; k < 18; k++) {
              const u = S[k] * 2 - 1, a = S[k + 18] * Math.PI * 2, rr = Math.sqrt(1 - u * u);
              const rad = Rf * (0.9 + 0.3 * t) * Math.pow(S[k + 36], 0.5);
              smoke.puff(fx + Math.cos(a) * rr * rad, fy2 + u * rad, fz + Math.sin(a) * rr * rad, Rf * 0.6, 0.85 * al * smooth(0, 0.3, t), 0.35, 2.2 * glowK + 0.15, S[k + 54]);
            }
            // the stem
            for (let k = 0; k < 22; k++) {
              const f2 = k / 22;
              const y = hc * 0.8 * f2;
              const rs = Rf * (0.35 + 0.25 * f2) + H * 0.03;
              smoke.puff(fx + (S[k + 70] - 0.5) * rs * 0.5, Math.max(y, rs * 0.5), fz + (S[k + 92] - 0.5) * rs * 0.5, rs, 0.7 * al * smooth(0.4, 1.4, t), 0.5 + 0.15 * S[k + 110], 0.6 * glowK * (1 - f2), S[k + 130]);
            }
            // the cap: a rolling ring of cloud at the top
            const capR = H * 0.32 * smooth(0, 2.5, t) + Rf * 0.6, capr = H * 0.14 * smooth(0, 1.6, t) + Rf * 0.4;
            for (let k = 0; k < 40; k++) {
              const a = (k / 40) * Math.PI * 2 + t * 0.2;
              const ro = capR * (0.8 + 0.3 * S[k + 3]);
              const y = hc + Math.sin(a * 3 + S[k]) * capr * 0.25 + (S[k + 45] - 0.5) * capr * 0.6;
              smoke.puff(fx + Math.cos(a) * ro, y, fz + Math.sin(a) * ro, capr * (0.8 + 0.4 * S[k + 80]), 0.75 * al, 0.62 + 0.15 * S[k + 120], 1.2 * glowK, S[k + 100]);
            }
            for (let k = 0; k < 10; k++) {
              const a = S[k + 140] * Math.PI * 2, ro = capR * 0.5 * S[k + 150];
              smoke.puff(fx + Math.cos(a) * ro, hc + capr * 0.3, fz + Math.sin(a) * ro, capr * 1.1, 0.75 * al, 0.6, 1.0 * glowK, S[k + 10]);
            }
          }
        }
      }
      shells.count = ns;
      shells.instanceMatrix.needsUpdate = true; aA.needsUpdate = true;

      // ---- the ground damage so far ----
      let flatRn = 0, round = 0, scorch = 0, crater = 0, fire = 0;
      for (let n = 9; n <= N_PUNCH; n++) {
        const t = v - vPunch(n);
        if (t < 0) break;
        const f = Math.pow(clamp(t / frontTime(n)), 1 / 0.75);
        flatRn = Math.max(flatRn, flatR(n) * f);
        round = smooth(9.5, 12.5, n);
        if (n >= 12) { scorch = Math.max(scorch, fireR(n) * 3.2 * smooth(0, 0.6, t)); fire = 1; }
        crater = Math.max(crater, 2.5 * Math.pow(10, (n - 9) / 3.2) * smooth(0, 0.3, t));
      }
      // (the crater under you only matters once you're above it)
      GU.uFlatR.value = flatRn; GU.uRound.value = round; GU.uScorchR.value = scorch; GU.uCraterR.value = crater; GU.uFire.value = fire;
      return flash;
    },
  };
}
