// The hits. Each grain: a line of light down the sky (slow enough to watch at first, instant by the end: at 99.9% of light
// speed the grain arrives right behind its own light); the flash; a fireball that swells and cools; the sand thrown up in a
// spray of clods and a plume of dust; a ring of dust racing out along the ground with the blast front, and from hit 5 a white
// dome of shocked air. From hit 7 the column stands for good: a stem and a mushroom cap that climb with every hit.
import * as THREE from 'three';
import { HIT, CAM0, groundY } from './layout.js';
import { HITS, SHOCK, V_LAST, V_REACH } from './timeline.js';
import { rng, smooth, clamp, lerp } from './util.js';

const NOISE = /* glsl */ `
  float h13(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
  float n3(vec3 p) { vec3 i = floor(p); vec3 f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(h13(i), h13(i + vec3(1,0,0)), f.x), mix(h13(i + vec3(0,1,0)), h13(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(h13(i + vec3(0,0,1)), h13(i + vec3(1,0,1)), f.x), mix(h13(i + vec3(0,1,1)), h13(i + vec3(1,1,1)), f.x), f.y), f.z); }
  float fbm(vec3 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * n3(p); p = p * 2.05 + 1.9; a *= 0.5; } return s; }
`;
// where the grains come from: high over the far end of the bay, down to the spot
export const FROM = new THREE.Vector3(0.1, 0.31, -0.94).normalize();
const WALL_R = 7000;
const FLIGHT = [3.0, 1.3, 0.8, 0.5, 0.3];                 // seconds on screen, for the first five (after that: no time at all)

export function makeBlast(scene, smoke) {
  const FU = { uTime: { value: 0 }, uAge: { value: 0 }, uWhite: { value: 0 }, uGain: { value: 1 } };
  const fireMat = new THREE.ShaderMaterial({
    uniforms: FU,
    vertexShader: /* glsl */ `uniform float uTime; uniform float uAge; varying vec3 vP;
      ${NOISE}
      void main(){
        vec3 n = normalize(position);
        float d = fbm(n * 2.6 + vec3(0.0, -uAge * 0.6, 0.0) + uTime * 0.3) - 0.5;
        vec3 p = n * (1.0 + d * 0.32);
        vP = p;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: /* glsl */ `uniform float uTime; uniform float uAge; uniform float uWhite; uniform float uGain; varying vec3 vP;
      ${NOISE}
      void main(){
        vec3 n = normalize(vP);
        float m = fbm(n * 3.5 + vec3(0.0, -uAge * 0.8, 0.0) + uTime * 0.4);
        float m2 = n3(n * 11.0 - uTime * 1.5);
        float temp = 1.0 - smoothstep(0.0, 1.5, uAge);
        vec3 hot = mix(vec3(2.6, 0.75, 0.14), vec3(6.0, 4.8, 3.4), temp * temp);
        float soot = smoothstep(0.4, 0.62, m + 0.15 * m2 - 0.08) * smoothstep(0.25, 1.1, uAge);
        vec3 c = mix(hot * uGain * (0.55 + 0.9 * m), vec3(0.14, 0.09, 0.06) * (0.6 + m), soot);
        c *= 0.8 + 0.3 * clamp(n.y + 0.5, 0.0, 1.0);
        c = mix(c, vec3(7.0, 6.2, 5.0), uWhite);
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  const fireball = new THREE.Mesh(new THREE.SphereGeometry(1, 72, 48), fireMat);
  fireMat.side = THREE.DoubleSide;
  fireball.frustumCulled = false; fireball.visible = false;
  scene.add(fireball);

  // the line of light
  const beamMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(7, 8, 11), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 8, 1, true), beamMat);
  beam.frustumCulled = false; beam.visible = false; beam.renderOrder = 7;
  beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), FROM);
  scene.add(beam);

  // the dome of shocked air
  const domeU = { uK: { value: 0 } };
  const dome = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 24, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.ShaderMaterial({
    uniforms: domeU, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `varying vec3 vN; varying vec3 vV; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vN = normalize(position); vV = normalize(cameraPosition - w.xyz); gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */ `uniform float uK; varying vec3 vN; varying vec3 vV; void main(){ float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.5); gl_FragColor = vec4(vec3(1.0, 0.98, 0.95) * (f * 0.3 + 0.012) * uK, 1.0); }`,
  }));
  dome.frustumCulled = false; dome.visible = false; dome.renderOrder = 6;
  dome.position.set(HIT.x, 0, HIT.z);
  scene.add(dome);

  // the far sea and sea floor thrown up in a wall all along the horizon: dark rock and water, white water pouring down its face,
  // its torn top lit from behind by the white sky
  const WU = { uTime: { value: 0 }, uH: { value: 0 }, uW: { value: 0 } };
  const wall = new THREE.Mesh(new THREE.CylinderGeometry(WALL_R, WALL_R, 1, 240, 1, true, 1.3, 3.4).translate(0, 0.5, 0), new THREE.ShaderMaterial({
    uniforms: WU, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    vertexShader: /* glsl */ `uniform float uH; varying vec2 vUv; varying vec3 vW; void main(){ vUv = uv; vec3 p = position; p.y *= 3000.0; vec4 w = modelMatrix * vec4(p, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */ `uniform float uTime; uniform float uH; uniform float uW; varying vec2 vUv; varying vec3 vW;
      ${NOISE}
      void main(){
        float a = atan(vW.x + 9.0, vW.z + 172.0) * 7000.0;
        float top = uH * (0.72 + 0.5 * fbm(vec3(a * 0.0011, uTime * 0.25, 1.0))) + 60.0 * n3(vec3(a * 0.02, uTime * 0.9, 2.0));
        float y = vW.y;
        if (y > top) discard;
        float k = y / top;
        float streak = fbm(vec3(a * 0.006, y * 0.0012 + uTime * 0.9, 3.0));
        vec3 rock = mix(vec3(0.05, 0.05, 0.06), vec3(0.14, 0.11, 0.09), n3(vec3(a * 0.01, y * 0.02, 4.0)));
        vec3 c = mix(vec3(0.02, 0.07, 0.11), rock, smoothstep(0.1, 0.6, k));
        c = mix(c, vec3(0.75, 0.8, 0.82), smoothstep(0.56, 0.68, streak) * (1.0 - smoothstep(0.75, 1.0, k)) * 0.8);
        // the torn top, lit from behind
        c += vec3(2.2, 1.5, 0.8) * smoothstep(top - 40.0, top, y) * (0.5 + uW);
        gl_FragColor = vec4(c, smoothstep(0.0, 0.03, k));
      }`,
  }));
  wall.frustumCulled = false; wall.visible = false; wall.renderOrder = 2;
  wall.position.set(HIT.x, 0, HIT.z);
  scene.add(wall);

  // clods of sand and bits of beach: thrown on a ballistic path, each hit its own set
  const NC = 900;
  const clods = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ color: 0x9c8159, roughness: 0.95, flatShading: true }), NC);
  clods.frustumCulled = false; clods.castShadow = false;
  scene.add(clods);
  const R = rng(1212);
  const CL = Array.from({ length: NC }, () => ({ a: R() * 6.283, el: 0.5 + R() * 0.95, sp: 0.5 + R() * 0.8, sz: 0.5 + R() * R() * 1.6, sx: R() * 6, sy: R() * 6 }));
  const PL = Array.from({ length: 190 }, () => ({ a: R() * 6.283, r: 0.2 + R(), hgt: R(), sz: 0.5 + R() * 0.7, ph: R() * 10, sh: 0.36 + R() * 0.3 }));
  const RING = Array.from({ length: 80 }, () => ({ a: R() * 6.283, sz: 0.5 + R() * 0.9, y: R(), ph: R() * 10, back: R() }));
  const STEM = Array.from({ length: 110 }, () => ({ u: R(), a: R() * 6.283, r: R(), sz: 0.6 + R() * 0.7, ph: R() * 10 }));
  const CAP = Array.from({ length: 200 }, () => ({ a: R() * 6.283, th: R() * 6.283, sz: 0.55 + R() * 0.6, ph: R() * 10, sh: 0.3 + R() * 0.35, k: R() }));
  const EMB = Array.from({ length: 150 }, () => { const a = 2.3 + R() * 2.6, r = 8 + Math.pow(R(), 0.7) * 240; return { x: CAM0.x + Math.sin(a) * r * 0.9 + 26, z: CAM0.z + Math.cos(a) * r * 1.0 - 60, sz: 0.5 + R() * 1.5, ph: R() * 10, up: 0.5 + R() }; });
  const dummy = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), sc = new THREE.Vector3();
  const hide = new THREE.Matrix4().makeScale(0, 0, 0);
  const G = 9.8;

  // how high the column has climbed
  const topAt = (v) => {
    let t = 0;
    for (const h of HITS) if (h.up && v > h.t) t = lerp(t, h.up, 1 - Math.exp(-(v - h.t) / 1.4));
    return t;
  };
  return {
    fireball, FU, topAt,
    frame(v, s, glows, pl) {
      // ---- the grain on its way: the line of light, its head a white-hot dot ----
      beam.visible = false;
      for (const h of HITS) {
        const f = h.k <= FLIGHT.length ? FLIGHT[h.k - 1] : 0.07;
        const u = (h.t - v) / f;
        const after = v - h.t;
        if (u < -0.001 && after > (h.k > 5 ? 0.3 : 0.02)) continue;
        if (u > 1) continue;
        const L = 1900, far = clamp(u, 0, 1) * L;                       // the head, this far up the line
        const trail = h.k <= 5 ? Math.min(160 + h.k * 150, L) : L * 3;
        const head = far, tail = far + trail;
        const w = (0.16 + 0.05 * h.k) * (h.k > 5 ? (h.k - 3) : 1) * (1 - smooth(0, 0.3, Math.max(after, 0)));
        beam.visible = true;
        beam.position.set(HIT.x + FROM.x * (head + tail) / 2, FROM.y * (head + tail) / 2, HIT.z + FROM.z * (head + tail) / 2);
        beam.scale.set(w + head * 0.0012, tail - head, w + head * 0.0012);
        beamMat.opacity = h.k > 5 ? 1 - smooth(0, 0.3, Math.max(after, 0)) : 0.9;
        if (u > 0) {
          const x = HIT.x + FROM.x * far, y = FROM.y * far, z = HIT.z + FROM.z * far;
          const sz = 0.8 + far * 0.016;
          glows.add(x, y, z, sz, 3.2, 3.6, 5);
          glows.add(x, y, z, sz * 3.5, 0.3, 0.42, 0.8);
        }
      }
      // ---- the last hit and the one before it ----
      const c0 = s.hit;
      let nC = 0;
      for (let idx = Math.max(0, s.i - 1); idx <= s.i; idx++) {
        const h = HITS[idx], age = v - h.t, rf = h.rf;
        if (age < 0) continue;
        // the flash and the spark
        if (age < 0.5) {
          const f = Math.exp(-age / 0.09);
          glows.add(HIT.x, 0.3 + rf * 0.2, HIT.z, rf * (h.k === 1 ? 1.6 : 5) + 0.3, 6 * f * Math.min(1, 0.3 + 0.2 * h.k), 5.4 * f * Math.min(1, 0.3 + 0.2 * h.k), 4 * f * Math.min(1, 0.3 + 0.2 * h.k));
          if (h.k === 1) for (let i = 0; i < 18; i++) {                  // the first one: a tiny shower of sparks
            const a = i * 2.4, sp = 3 + (i % 5) * 1.2, t = age;
            glows.add(HIT.x + Math.sin(a) * sp * t, 0.1 + 6 * t - 9.8 * t * t, HIT.z + Math.cos(a) * sp * t, 0.2, 5 * f, 3 * f, 1 * f);
          }
        }
        // clods
        const n = Math.round(lerp(14, 150, clamp(h.k / 10)));
        const vel = 5 + Math.sqrt(rf) * 13;
        for (let i = 0; i < n && nC < NC; i++) {
          const c = CL[(i * 7 + idx * 61) % NC];
          const dt = age, vh = vel * c.sp * Math.cos(c.el), vv = vel * c.sp * Math.sin(c.el);
          const y = vv * dt - 0.5 * G * dt * dt;
          if (y < -0.5 || dt > 5) continue;
          const r0 = h.rc * 0.8;
          e.set(c.sx * dt, c.sy * dt, 0); q.setFromEuler(e);
          dummy.compose(p.set(HIT.x + Math.sin(c.a) * (r0 + vh * dt), Math.max(0.1, y + 0.5), HIT.z + Math.cos(c.a) * (r0 + vh * dt)), q, sc.setScalar(Math.min(c.sz * (0.05 + rf * 0.02), 0.9)));
          clods.setMatrixAt(nC++, dummy);
        }
        // the plume of dust out of the crater
        const k = clamp(h.k / 12), pk = h.k >= 8 ? 0.5 : 1, N = h.k >= 8 ? 60 : Math.round(lerp(34, 180, k));
        // (the small ones settle fast, so you can see the hole they made)
        const fade = h.k <= 3 ? 1 - smooth(0.9, 2.1, age) : h.k <= 5 ? 1 - smooth(1.6, 2.9, age) : 1 - smooth(idx === s.i ? 3.0 : 2.4, 5.2, age);
        const g1 = 1 - Math.exp(-age / 0.32), g2 = 1 - Math.exp(-age / 1.0);
        for (let i = 0; i < N; i++) {
          const q2 = PL[(i * 3 + idx * 17) % PL.length];
          const rr = (h.rc * 0.5 + rf * 0.8 * pk * q2.r * q2.r * g1) * (1 + 0.14 * age);
          const yy = rf * pk * (0.1 + 1.1 * q2.hgt * q2.hgt) * g2 + age * rf * 0.1 * q2.hgt;
          const rad = rf * pk * (0.09 + 0.17 * g2) * q2.sz;
          smoke.puff(HIT.x + Math.sin(q2.a) * rr, yy + rad * 0.3, HIT.z + Math.cos(q2.a) * rr, rad, 0.9 * fade * smooth(0, 0.08, age), q2.sh, Math.exp(-age / 0.45) * 0.55, q2.ph);
        }
        // the blast's ring of dust, running out along the sand
        if (h.k >= 3) {
          const front = Math.min(SHOCK * age, h.reach);
          const fadeR = (1 - smooth(h.reach / SHOCK, h.reach / SHOCK + 1.2, age));
          const NR = Math.round(lerp(26, 80, k));
          for (let i = 0; i < NR; i++) {
            const q3 = RING[i % RING.length];
            const rr = front - q3.back * rf * 0.5;
            if (rr < 4) continue;
            const rad = (rf * 0.2 + 2) * q3.sz * (0.5 + 0.5 * smooth(0, 1.2, age));
            smoke.puff(HIT.x + Math.sin(q3.a) * rr, rad * 0.5 + q3.y * 2, HIT.z + Math.cos(q3.a) * rr, rad, 0.7 * fadeR, 0.5, 0, q3.ph);
          }
        }
      }
      clods.count = nC;
      clods.instanceMatrix.needsUpdate = true;
      // ---- a thread of smoke still rising out of the hole between the small hits ----
      if (s.i >= 1 && s.i <= 5) {
        for (let i = 0; i < 14; i++) {
          const u = ((v * 0.22 + i / 14) % 1), rr = s.Rc * 0.35 * (0.4 + u);
          smoke.puff(HIT.x + Math.sin(i * 2.4 + u * 3) * rr, u * (2 + s.Rc * 3.2), HIT.z + Math.cos(i * 2.4 + u * 3) * rr, (0.2 + s.Rc * 0.16) * (0.5 + u), 0.5 * Math.sin(Math.PI * u) * smooth(0.5, 1.2, s.age), 0.3, 0, i * 0.7);
        }
      }
      // ---- the fireball of the last hit ----
      fireball.visible = false;
      if (c0) {
        const age = s.age;
        const last = c0.k === HITS.length;
        const R1 = last ? lerp(c0.rf, 340, Math.pow(smooth(0, V_REACH - V_LAST + 0.3, age), 2.6)) : c0.rf;
        const life = c0.k <= 3 ? 0.55 : c0.k >= 10 ? 0.75 : 1.5;
        const rf = R1 * (1 - Math.exp(-age / 0.16)) * (last ? 1 : 1 - smooth(life, life + 0.8, age));
        if (rf > 0.03) {
          fireball.visible = true;
          fireball.position.set(HIT.x, rf * 0.34, HIT.z);
          fireball.scale.setScalar(rf);
          FU.uTime.value = v; FU.uAge.value = age; FU.uWhite.value = last ? smooth(0, 1, age) : 0;
          FU.uGain.value = lerp(0.42, 1, clamp((c0.k - 2) / 7));
        }
      }
      // ---- the shock dome ----
      dome.visible = false;
      if (c0 && c0.k >= 5) {
        const rr = SHOCK * s.age;
        if (rr < c0.reach && rr > 2 && rr < 700) {
          dome.visible = true;
          dome.scale.set(rr, rr * 0.75, rr);
          domeU.uK.value = 1.0 * (1 - rr / Math.min(700, c0.reach)) ;
        }
      }
      // ---- the column: from hit 7 it stands for good ----
      const top = topAt(v);
      if (top > 1) {
        const stemR = 12 + top * 0.05;
        const capR = 34 + top * 0.24, capH = 20 + top * 0.1;
        const rise = v * 0.25;
        const heat = Math.exp(-s.age / 0.9);
        const fade = 1 - smooth(45.2, 46.2, v);
        for (const q2 of STEM) {
          const u = (q2.u + rise * 0.1) % 1, y = u * top * 0.92;
          const rr = stemR * q2.r * (0.6 + 0.6 * Math.abs(u - 0.5) * 2);
          const rad = Math.min(stemR * (0.5 + 0.35 * u) * q2.sz, 26);
          smoke.puff(HIT.x + Math.sin(q2.a + u * 3) * rr, y, HIT.z + Math.cos(q2.a + u * 3) * rr, rad, 0.85 * fade, 0.16 + 0.16 * u, (0.2 + heat * 0.7) * (1 - u) * (1 - u) * (1 - s.white), q2.ph);
        }
        for (const c of CAP) {
          // a torus rolling outward over the top
          const th = c.th + v * 0.45, a = c.a + v * 0.03;
          const ring = capR * (0.55 + 0.45 * Math.cos(th)), yy = top + capH * Math.sin(th);
          const rad = Math.min(capR * 0.25 * c.sz, 42);
          smoke.puff(HIT.x + Math.sin(a) * ring, yy, HIT.z + Math.cos(a) * ring, rad, 0.9 * fade, c.sh * 0.62, (0.14 + heat * 0.8) * clamp(0.5 - Math.sin(th) * 0.6) * (1 - s.white), c.ph);
        }
      }
      // ---- the waves in the ground: a line of dust thrown up along each crest as it rolls at you ----
      if (s.roll > 0.02) {
        for (let n = -3; n < 3; n++) {
          const rr = (v - 38) * 95 + (Math.PI / 2 + n * 6.2832) / 0.021;
          if (rr < s.Rc || rr > 900) continue;
          for (let i = 0; i < 26; i++) {
            const a = 2.6 + 1.3 * ((i * 0.618) % 1), wob = Math.sin(i * 7.3) * 8;
            const rad = (5 + 7 * ((i * 0.37) % 1)) * (0.5 + s.roll);
            smoke.puff(HIT.x + Math.sin(a) * (rr + wob), rad * 0.6 + 2 + 7 * s.roll, HIT.z - Math.cos(a) * (rr + wob), rad, 0.6 * s.roll * smooth(0, 30, rr - s.Rc), 0.42, 0.08, i * 0.31);
          }
        }
      }
      // ---- the wall rising along the horizon ----
      wall.visible = s.lift > 5;
      if (wall.visible) { WU.uTime.value = v; WU.uH.value = s.lift; WU.uW.value = s.white; }
      // burning scraps all over the sand, from the first big blast on
      if (s.burn > 0) for (const m of EMB) {
        const f = 0.6 + 0.4 * Math.sin(v * (6 + m.ph) + m.ph * 9);
        const d = Math.hypot(m.x - HIT.x, m.z - HIT.z);
        if (d < s.Rc * 1.05) continue;
        const yy = 0.4 + ((v * m.up + m.ph) % 1) * 0.3;
        glows.add(m.x, groundY(m.x, m.z) + yy, m.z, m.sz, 2.6 * f * s.burn, 0.95 * f * s.burn, 0.2 * f * s.burn);
      }
      // the light of it on the world
      if (pl) {
        let I = 0;
        for (const h of HITS) { const dt = v - h.t; if (dt > 0 && dt < 4) I = Math.max(I, Math.pow(h.k / 8, 3.4) * (h.k < 5 ? 0.35 : 1) * Math.exp(-dt / 0.4)); }
        pl.position.set(HIT.x, 30 + top * 0.05, HIT.z);
        pl.intensity = Math.min(I, 1.0) * 1.6e5 + s.fireK * 3.2e4;
      }
    },
  };
}
