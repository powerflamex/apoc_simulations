// The blast front on the ground: a ragged wall of dust and torn-up city, a ring round ground zero whose radius comes from
// the timeline (s.front), so the buildings, cars and the street react to it at the same moment. A low wall at the very
// front and taller banks of dust behind it, so a tower caught by it stands up out of the dust and falls into it.
// Debris flies in its face in the last moments. Ahead of it: fires over the city and smoke rising from them, and the
// street's awnings and trees starting to smoke in the heat.
import * as THREE from 'three';
import { HIT, CAM0, PLAIN, STALLS, TREES, groundY } from './layout.js';
import { rng, smooth, clamp } from './util.js';
import { V_WALL, V_STREET, V_SMOKE } from './timeline.js';

const NOISE = /* glsl */ `
  float h13(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
  float n3(vec3 p) { vec3 i = floor(p); vec3 f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(h13(i), h13(i + vec3(1,0,0)), f.x), mix(h13(i + vec3(0,1,0)), h13(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(h13(i + vec3(0,0,1)), h13(i + vec3(1,0,1)), f.x), mix(h13(i + vec3(0,1,1)), h13(i + vec3(1,1,1)), f.x), f.y), f.z); }
  float fbm(vec3 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * n3(p); p = p * 2.05 + 1.9; a *= 0.5; } return s; }
`;

export function makeBlast(scene, smoke) {
  const WU = { uTime: { value: 0 }, uLight: { value: new THREE.Color(1, 0.6, 0.3) }, uHaze: { value: new THREE.Color(0.1, 0.1, 0.15) } };
  const wallMat = new THREE.ShaderMaterial({
    uniforms: WU, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    vertexShader: /* glsl */ `varying vec2 vUv; varying vec3 vW;
      void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */ `uniform float uTime; uniform vec3 uLight; uniform vec3 uHaze; varying vec2 vUv; varying vec3 vW;
      ${NOISE}
      // rounded lumps with hard creases between them
      float bil(vec3 p) { float s = 0.0, a = 1.0; for (int i = 0; i < 5; i++) { float n = abs(2.0 * n3(p) - 1.0); n = 1.0 - (1.0 - n) * (1.0 - n); s += a * n; p = p * 2.03 + 2.7; a *= 0.5; } return s / 1.94; }
      vec2 lump(vec3 P, float sc) {
        vec3 q = P * sc;
        float h = bil(q);
        return vec2(h, h - bil(q + vec3(0.0, 0.1, 0.0)));          // how high, and how much it faces up
      }
      void main(){
        float t = vUv.y;
        float dist = length(vW - cameraPosition);
        // lumps sized for the distance: the wall looks the same kind of rough ten miles off or down the street, and as it
        // comes they swell from one size to the next
        float L = log2(max(dist, 50.0) / 50.0);
        float L0 = floor(L), fr = L - L0;
        float s0 = 0.09 / pow(2.0, L0);
        vec3 P = vW + vec3(0.0, -uTime * 34.0, 0.0);
        // (each size has its own pattern, the same one on both sides of a change of size, so no seam shows)
        vec2 a0 = lump(P + 37.0 * mod(L0, 7.0) / s0 * 0.04, s0), a1 = lump(P + 37.0 * mod(L0 + 1.0, 7.0) / (s0 * 0.5) * 0.04, s0 * 0.5);
        float h = mix(a0.x, a1.x, fr), up = mix(a0.y, a1.y, fr);
        float top = 0.74 + 0.5 * (h - 0.4);
        float a = smoothstep(top, top - 0.03, t);
        // dark in the creases, dust-brown on the lumps, a little light on whatever faces up
        vec3 dust = mix(vec3(0.012, 0.01, 0.009), vec3(0.15, 0.1, 0.066), smoothstep(0.2, 0.62, h));
        dust *= 0.5 + 6.0 * clamp(up + 0.06, 0.0, 0.2);
        dust *= (0.6 + 0.6 * t) * vec3(1.2, 0.98, 0.8);
        // the fireball's light along the ragged top
        dust += uLight * smoothstep(top - 0.04, top, t) * 0.7 * (0.2 + h);
        // torn-up ground at the foot
        dust = mix(dust, vec3(0.03, 0.025, 0.022) * (0.6 + 2.0 * h), smoothstep(0.18, 0.0, t));
        dust = mix(dust, uHaze, (1.0 - exp(-dist / 9000.0)) * 0.7);
        gl_FragColor = vec4(dust, a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const ringGeo = new THREE.CylinderGeometry(1, 1, 1, 640, 1, true).translate(0, 0.5, 0);
  // [behind the front (m), height (m)]
  const BANKS = [[0, 420], [700, 900], [2000, 1800]];
  const banks = BANKS.map(() => {
    const m = new THREE.Mesh(ringGeo, wallMat);
    m.frustumCulled = false; m.visible = false; m.renderOrder = 5;
    scene.add(m);
    return m;
  });

  const R = rng(7070);
  // what the wall carries in front of it: chunks, sheets of metal, signs, turning over as they come
  const toYou = Math.atan2(CAM0.x - HIT.x, CAM0.z - HIT.z);
  const N_BITS = 220;
  const bits = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0x4a443e, roughness: 0.8 }), N_BITS);
  bits.frustumCulled = false;
  scene.add(bits);
  const BITS = Array.from({ length: N_BITS }, () => ({ off: (R() - 0.5) * 2 * 0.012, lead: -30 + R() * 34, hgt: Math.pow(R(), 1.6), s: [0.5 + R() * 3.2, 0.2 + R() * 1.4, 0.5 + R() * 2.4], rot: [R() * 6, R() * 6, R() * 6], spin: [(R() - 0.5) * 9, (R() - 0.5) * 9, (R() - 0.5) * 9] }));
  const m4 = new THREE.Matrix4(), q4 = new THREE.Quaternion(), e4 = new THREE.Euler(), p4 = new THREE.Vector3(), s4 = new THREE.Vector3();
  // the fires seen from the hill: where they are, when they catch, how big
  const FIRES = [];
  for (let i = 0; i < 190; i++) {
    const dist = 1100 + Math.pow(R(), 0.7) * 12500, b = (R() - 0.5) * 0.72;
    const x = CAM0.x + dist * Math.sin(b), z = CAM0.z - dist * Math.cos(b);
    FIRES.push({ x, z, y: groundY(z), t0: V_SMOKE + 1.5 + R() * 11, s: (70 + R() * 130) * (0.5 + dist / 9000), rate: 26 + R() * 24, ph: R() * 10, drift: 0.2 + R() * 0.4 });
  }
  // what the heat lights on the street: stall awnings and treetops start to smoke
  const SMOULDER = [];
  for (const st of STALLS) SMOULDER.push({ x: st.x, y: 3.3 + groundY(st.z), z: st.z, t0: V_SMOKE + R() * 5, s: 0.9, ph: R() * 10 });
  for (const t of TREES) if (t.z < 6 && t.z > -180 && R() < 0.55) SMOULDER.push({ x: t.x, y: t.h + t.y, z: t.z, t0: V_SMOKE + R() * 7, s: 1.6, ph: R() * 10 });

  return {
    banks, WU,
    frame(v, s, glows) {
      WU.uTime.value = v;
      const on = s.front > 0;
      banks.forEach((m, i) => {
        const r = s.front - BANKS[i][0];
        m.visible = on && r > 40;
        if (!m.visible) return;
        // (a dust ring starts low near ground zero, inside the fireball)
        const H = BANKS[i][1] * (1 + 0.5 * smooth(V_STREET - 3, V_WALL, v));
        m.position.set(HIT.x, PLAIN - 5, HIT.z);
        m.scale.set(r, H * smooth(40, 1800, r), r);
      });
      // the debris, in the last moments
      const dd = s.left, show = on && dd < 900;
      bits.visible = show;
      if (show) {
        BITS.forEach((b, i) => {
          const rr = s.front + b.lead, a = toYou + b.off;
          const x = HIT.x + Math.sin(a) * rr, z = HIT.z + Math.cos(a) * rr;
          const y = groundY(z) + 3 + b.hgt * 150 * smooth(0, 420, dd);
          e4.set(b.rot[0] + v * b.spin[0], b.rot[1] + v * b.spin[1], b.rot[2] + v * b.spin[2]);
          m4.compose(p4.set(x, y, z), q4.setFromEuler(e4), s4.set(b.s[0], b.s[1], b.s[2]));
          bits.setMatrixAt(i, m4);
        });
        bits.instanceMatrix.needsUpdate = true;
      }
      // smoke over the fires
      for (const f of FIRES) {
        const age = v - f.t0;
        if (age < 0) continue;
        const rr = Math.hypot(f.x - HIT.x, f.z - HIT.z);
        if (rr < s.front) continue;
        const dist = Math.hypot(f.x - CAM0.x, f.z - CAM0.z);
        const g = smooth(0, 4, age);
        glows.add(f.x, f.y + f.s * 0.2, f.z, f.s * 1.4, 3.2 * g, 0.95 * g, 0.14 * g);
        if (dist > 7000 || dist < 2500) continue;
        for (let k = 0; k < 5; k++) {
          const u = ((age * 0.11 + k / 5 + f.ph) % 1);
          const y = f.y + f.rate * 6 * u * Math.min(age + 2, 9);
          smoke.puff(f.x + (u * u) * f.s * 3 * f.drift, y, f.z, f.s * (0.5 + 1.7 * u), 0.3 * g * (1 - u), 0.14, 0.45 * (1 - u) * (1 - u), f.ph + k);
        }
      }
      for (const m of SMOULDER) {
        const age = v - m.t0;
        if (age < 0) continue;
        const g = smooth(0, 3.5, age);
        for (let k = 0; k < 4; k++) {
          const u = ((age * 0.28 + k / 4 + m.ph) % 1);
          smoke.puff(m.x + u * 1.6 * Math.sin(m.ph + k), m.y + u * 8, m.z, m.s * (0.55 + 1.8 * u), 0.38 * g * (1 - u), 0.3, 0.08 * (1 - u), m.ph + k);
        }
        if (age > 2.5) glows.add(m.x, m.y - 0.2, m.z, m.s * 1.1, 2.2 * g, 0.7 * g, 0.1 * g);
      }
    },
  };
}
