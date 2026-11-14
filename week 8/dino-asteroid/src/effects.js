// What arrives after the flash, in the order it really comes (timeline.js):
//   - the rocks blasted out of the crater, 8 minutes on: glowing streaks raining in from the south, steeply, over the whole
//     sky; a few land in the river (splashes) and on the street around you (a burst of sparks and dust);
//   - the blast, 48 minutes on: a ragged wall of dust and torn-up ground the width of the world, seen first as a dark
//     band on the horizon, then crossing the land, flattening the far bank's city (each block tips over just as the front
//     reaches it), crossing the river toward you; debris in its face, and in the last moments pieces flung at the lens.
import * as THREE from 'three';
import { makeStreaks } from './streaks.js';
import { CAM0, SEA_Y, QUAY, FAR_BANK, BLD, FARB, FX, groundY } from './layout.js';
import { rng, smooth, clamp, lerp } from './util.js';
import { V_EJECTA, V_HIT } from './timeline.js';

const NOISE = /* glsl */ `
  float h13(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
  float n3(vec3 p) { vec3 i = floor(p); vec3 f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(h13(i), h13(i + vec3(1,0,0)), f.x), mix(h13(i + vec3(0,1,0)), h13(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(h13(i + vec3(0,0,1)), h13(i + vec3(1,0,1)), f.x), mix(h13(i + vec3(0,1,1)), h13(i + vec3(1,1,1)), f.x), f.y), f.z); }
`;

// ---------- the falling rocks, planned once ----------
const FALL = [];
{
  const R = rng(8800);
  // rate (per video second): a first few, then a downpour that keeps on to the end
  for (let t = V_EJECTA - 0.5; t < V_HIT + 1; ) {
    const k = smooth(V_EJECTA - 0.5, V_EJECTA + 2.5, t);
    t += 1 / (8 + 70 * k);
    const big = R() < 0.07;
    // where it lands: mostly far off across the river and the land; some in the river; a few on the street near you
    const pick = R();
    let ex, ez;
    if (pick < 0.55) { ez = FAR_BANK - 100 - R() * 6000; ex = (R() - 0.5) * (2000 + (-ez) * 1.0); }
    else if (pick < 0.8) { ez = lerp(QUAY - 20, FAR_BANK + 20, R()); ex = (R() - 0.5) * 900; }
    else { ez = CAM0.z - 25 - R() * 220; ex = (R() - 0.5) * 2 * (FX + 40 + R() * 80); }
    const ey = ez < QUAY ? SEA_Y : groundY(ez);
    // they come in from the south (from the crater), steeply, some a little across
    const el = (40 + R() * 25) * Math.PI / 180, sw = (R() - 0.5) * 0.6;
    const dir = new THREE.Vector3(Math.sin(sw) * Math.cos(el), -Math.sin(el), Math.cos(sw) * Math.cos(el));
    const sp = 1600 + R() * 1400;                            // m per video second (the picture's speed, not the real 3 km/s)
    const H = 2200 + R() * 4500;
    const dur = (H - ey) / (-dir.y * sp);
    FALL.push({ t0: t, tLand: t + dur, ex, ey, ez, dir, sp, big, seed: R(), near: pick >= 0.8, water: ez < QUAY && ez > FAR_BANK });
  }
}

export function makeEffects(scene, smoke, fire, city) {
  const streaks = makeStreaks(scene, 1600);
  streaks.mat.uniforms.uGain.value = 1.0;

  // ---------- the dust wall ----------
  const WU = { uTime: { value: 0 }, uLight: { value: new THREE.Color(1, 0.4, 0.15) }, uHaze: { value: new THREE.Color(0.5, 0.3, 0.2) }, uD: { value: 30000 } };
  const wallMat = new THREE.ShaderMaterial({
    uniforms: WU, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    vertexShader: /* glsl */ `varying vec2 vUv; varying vec3 vW;
      void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */ `uniform float uTime; uniform vec3 uLight; uniform vec3 uHaze; uniform float uD; varying vec2 vUv; varying vec3 vW;
      ${NOISE}
      float bil(vec3 p) { float s = 0.0, a = 1.0; for (int i = 0; i < 5; i++) { float n = abs(2.0 * n3(p) - 1.0); n = 1.0 - (1.0 - n) * (1.0 - n); s += a * n; p = p * 2.03 + 2.7; a *= 0.5; } return s / 1.94; }
      void main(){
        float t = vUv.y;
        float dist = length(vW - cameraPosition);
        // lumps sized for the distance (each size its own pattern, cross-faded, so no seam shows as it comes)
        float L = log2(max(uD, 60.0) / 60.0), L0 = floor(L), fr = L - L0;
        float s0 = 0.06 / pow(2.0, L0);
        vec3 P = vec3(vW.x, vW.y - uTime * (8.0 + 0.002 * uD), uTime * 3.0);
        float h0 = bil(P * s0 + 37.0 * mod(L0, 7.0)), h1 = bil(P * s0 * 0.5 + 37.0 * mod(L0 + 1.0, 7.0));
        float h = mix(h0, h1, fr);
        float up = h - mix(bil((P + vec3(0.0, 4.0 / s0, 0.0)) * s0 + 37.0 * mod(L0, 7.0)), bil((P + vec3(0.0, 8.0 / s0, 0.0)) * s0 * 0.5 + 37.0 * mod(L0 + 1.0, 7.0)), fr);
        float top = 0.72 + 0.5 * (h - 0.42);
        float a = smoothstep(top, top - 0.02, t);
        // dark in the folds, dust-brown on the lumps; the red sky behind it lights its ragged top
        vec3 dust = mix(vec3(0.02, 0.015, 0.012), vec3(0.17, 0.11, 0.07), smoothstep(0.2, 0.65, h));
        dust *= 0.6 + 4.0 * clamp(up + 0.05, 0.0, 0.25);
        dust += uLight * smoothstep(top - 0.06, top, t) * 0.55 * (0.3 + h);
        dust = mix(dust, vec3(0.05, 0.035, 0.03) * (0.6 + 1.5 * h), smoothstep(0.16, 0.0, t));
        dust = mix(dust, uHaze, (1.0 - exp(-dist / 20000.0)) * 0.4);
        gl_FragColor = vec4(dust, a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(1, 1, 1, 1).translate(0, 0.5, 0), wallMat);
  wall.frustumCulled = false; wall.visible = false; wall.renderOrder = 5;
  scene.add(wall);

  // what the wall carries: chunks, sheets, signs, turning over as they come
  const R = rng(7070);
  const N_BITS = 260;
  const bits = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0x3a332e, roughness: 0.85 }), N_BITS);
  bits.frustumCulled = false; bits.visible = false;
  scene.add(bits);
  const BITS = Array.from({ length: N_BITS }, (_, i) => ({
    x: (R() - 0.5) * 900, lead: -10 - R() * 60, hgt: Math.pow(R(), 1.5), s: [0.6 + R() * 4, 0.15 + R() * 1.2, 0.5 + R() * 3],
    rot: [R() * 6, R() * 6, R() * 6], spin: [(R() - 0.5) * 9, (R() - 0.5) * 9, (R() - 0.5) * 9], lens: i < 5,
  }));
  const m4 = new THREE.Matrix4(), q4 = new THREE.Quaternion(), e4 = new THREE.Euler(), p4 = new THREE.Vector3(), s4 = new THREE.Vector3();
  const vA = new THREE.Vector3(), vB = new THREE.Vector3();

  // the far bank's blocks: tip over as the front reaches them
  const FALLEN = FARB.map((i) => ({ i, b: BLD[i], d: CAM0.z - BLD[i].z, lean: 0.9 + R() * 0.6, tw: (R() - 0.5) * 0.4 }));
  const Mb = new THREE.Matrix4(), Mr = new THREE.Matrix4(), Mt = new THREE.Matrix4(), Ms = new THREE.Matrix4(), Me = new THREE.Matrix4();

  return {
    frame(v, s, camera, glows) {
      WU.uTime.value = v;
      const C = camera.position;
      // ---------- the falling rocks ----------
      streaks.begin();
      const pxPerM = 1920 / (2 * Math.tan(camera.fov * Math.PI / 360));      // pixels per (metre at 1 m)
      for (const f of FALL) {
        if (v < f.t0 || v > f.tLand + 3) continue;
        const u = Math.min(v, f.tLand) - f.tLand;                // seconds before landing (<= 0)
        vB.set(f.ex, f.ey, f.ez).addScaledVector(f.dir, u * f.sp);
        const tl = Math.min(v - f.t0, 0.35);
        vA.copy(vB).addScaledVector(f.dir, -tl * f.sp);
        const dist = vB.distanceTo(C);
        if (v < f.tLand) {
          const rad = (f.big ? 7 : 2.6) * (0.6 + 0.4 * f.seed) * Math.max(0.6, Math.min(3, 900 / dist));
          const k = Math.min(1, (v - f.t0) / 0.15);
          if (f.big) streaks.add(vA, vB, rad * 0.5, rad, 2.4 * k, 1.1 * k, 0.4 * k, 4, f.seed, rad);
          else streaks.add(vA, vB, rad * 0.25, rad, 2.6 * k, 1.3 * k, 0.5 * k, 3, f.seed);
          if (f.big || dist < 600) glows.add(vB.x, vB.y, vB.z, rad / pxPerM * dist * 5, 1.6 * k, 0.6 * k, 0.15 * k);
        } else {
          // the landing: a flare, then dust or spray
          const age = v - f.tLand;
          const fl = Math.exp(-age / 0.25);
          const sz = (f.big ? 30 : 8) * (f.near ? 0.35 : 1) * Math.max(1, dist / 600);
          if (!f.water) glows.add(f.ex, f.ey + 1, f.ez, sz * 1.4, 3.0 * fl, 1.3 * fl, 0.35 * fl);
          if (dist < 2500) for (let k = 0; k < (f.near ? 4 : 2); k++) {
            const uu = Math.min(1, age / 2.5);
            const r0 = (f.near ? 1.5 : 6) * (f.big ? 2 : 1);
            smoke.puff(f.ex + (k - 1) * r0 * 0.6 * uu, f.ey + r0 * (0.4 + 2.2 * uu) + k * r0 * 0.5, f.ez, r0 * (0.6 + 1.6 * uu), (f.water ? 0.55 : 0.6) * (1 - uu), f.water ? 1.0 : 0.3, f.water ? 0 : 0.5 * fl, (f.seed + k * 0.3) % 1);
          }
        }
      }
      streaks.end();

      // ---------- the wall ----------
      const d = s.frontM;
      const on = s.wall > 0 && d > 0.5;
      wall.visible = on;
      if (on) {
        const W = Math.max(2400, d * 3.2);
        const Hw = lerp(2600, 1100, smooth(30000, 1500, d));
        wall.position.set(C.x, SEA_Y - 2, CAM0.z - d);
        wall.scale.set(W, Hw * (0.4 + 0.6 * s.wall), 1);
        WU.uD.value = d;
      }
      // the far bank's blocks go over as the front gets to them, then the dust has them
      for (const f of FALLEN) {
        const k = smooth(f.d + 20, f.d - 70, d);
        if (k <= 0 && !f.done) continue;
        const b = f.b;
        f.done = k > 0;
        if (d < f.d - 300) { city.mesh.setMatrixAt(f.i, Me.makeScale(0, 0, 0)); continue; }
        Mt.makeTranslation(b.x, b.y, b.z + b.d / 2);
        Mr.makeRotationX(k * f.lean).multiply(Mb.makeRotationY(f.tw * k));
        Ms.makeScale(b.w, b.h * (1 - 0.35 * k), b.d);
        Me.copy(Mt).multiply(Mr).multiply(Mb.makeTranslation(0, -0.5 * k, -b.d / 2)).multiply(Ms);
        city.mesh.setMatrixAt(f.i, Me);
      }
      city.mesh.instanceMatrix.needsUpdate = true;
      // the debris in its face, in the last ~1.5 km; the last few pieces come straight at you
      const show = on && d < 1500;
      bits.visible = show;
      if (show) {
        BITS.forEach((b, i) => {
          let x, y, z;
          if (b.lens) {
            // flung at the lens over the last 0.4 s
            const k = smooth(V_HIT - 0.45, V_HIT + 0.02, v);
            const z0 = CAM0.z - d - 20;
            x = C.x + (i - 2) * 2.2 * (1 - k) + (i - 2) * 0.25; y = C.y + 6 * (1 - k) - 0.3 * i + 0.6;
            z = lerp(z0, C.z - 1.2 - i * 0.4, k);
          } else {
            x = C.x + b.x * smooth(0, 1500, d) + b.x * 0.05;
            z = CAM0.z - d - b.lead * (d > 200 ? 1 : 0.4);
            y = (z < QUAY ? SEA_Y : groundY(z)) + 1 + b.hgt * 140 * smooth(0, 600, d) + b.hgt * 25;
          }
          e4.set(b.rot[0] + v * b.spin[0], b.rot[1] + v * b.spin[1], b.rot[2] + v * b.spin[2]);
          m4.compose(p4.set(x, y, z), q4.setFromEuler(e4), s4.set(b.s[0], b.s[1], b.s[2]));
          bits.setMatrixAt(i, m4);
        });
        bits.instanceMatrix.needsUpdate = true;
      }
    },
    WU,
  };
}
