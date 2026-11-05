// The hit: the fireball swelling over the far end of the avenue (a glowing, boiling sphere that cools from white to
// orange and sooty red), the blast front racing out from it as a ragged wall of dust and torn-up ground, dust clouds
// riding the front, burning debris flung ahead of it. The front's radius comes from the timeline (s.front) so the
// buildings, cars and people it passes react at the same moment.
import * as THREE from 'three';
import { HIT, CAM0 } from './layout.js';
import { rng, smooth, clamp, lerp } from './util.js';

const NOISE = /* glsl */ `
  float h13(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
  float n3(vec3 p) { vec3 i = floor(p); vec3 f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(h13(i), h13(i + vec3(1,0,0)), f.x), mix(h13(i + vec3(0,1,0)), h13(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(h13(i + vec3(0,0,1)), h13(i + vec3(1,0,1)), f.x), mix(h13(i + vec3(0,1,1)), h13(i + vec3(1,1,1)), f.x), f.y), f.z); }
  float fbm(vec3 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * n3(p); p = p * 2.05 + 1.9; a *= 0.5; } return s; }
`;

export function makeBlast(scene, smoke) {
  const FU = { uTime: { value: 0 }, uAge: { value: 0 } };
  const fireMat = new THREE.ShaderMaterial({
    uniforms: FU,
    vertexShader: /* glsl */ `uniform float uTime; uniform float uAge; varying vec3 vN; varying vec3 vP;
      ${NOISE}
      void main(){
        vec3 n = normalize(position);
        float d = fbm(n * 2.3 + vec3(0.0, -uAge * 0.5, 0.0) + uTime * 0.25) - 0.5;
        vec3 p = n * (1.0 + d * 0.3);
        vN = normalize(normalMatrix * n); vP = p;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: /* glsl */ `uniform float uTime; uniform float uAge; varying vec3 vN; varying vec3 vP;
      ${NOISE}
      void main(){
        vec3 n = normalize(vP);
        float m = fbm(n * 3.5 + vec3(0.0, -uAge * 0.7, 0.0) + uTime * 0.4);
        float m2 = n3(n * 11.0 - uTime * 1.5);
        float temp = 1.0 - smoothstep(0.0, 2.2, uAge);
        vec3 hot = mix(vec3(2.4, 0.7, 0.14), vec3(5.5, 4.4, 3.2), temp * temp);
        float soot = smoothstep(0.42, 0.68, m + 0.15 * m2 - 0.1) * smoothstep(0.4, 2.5, uAge);
        vec3 c = mix(hot * (0.55 + 0.9 * m), vec3(0.14, 0.09, 0.06) * (0.6 + m), soot);
        // lower half darker (the ground side), top boiling bright
        c *= 0.75 + 0.35 * clamp(n.y + 0.5, 0.0, 1.0);
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const fireball = new THREE.Mesh(new THREE.SphereGeometry(1, 72, 48), fireMat);
  fireball.frustumCulled = false; fireball.visible = false;
  scene.add(fireball);

  // the wall: an open ring round the hit, its top ragged, dust streaming up its face
  const WU = { uTime: FU.uTime, uAge: FU.uAge, uDense: { value: 1 } };
  const wallMat = new THREE.ShaderMaterial({
    uniforms: WU, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    vertexShader: /* glsl */ `varying vec2 vUv; varying vec3 vW;
      void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */ `uniform float uTime; uniform float uAge; uniform float uDense; varying vec2 vUv; varying vec3 vW;
      ${NOISE}
      void main(){
        float t = vUv.y;
        // rolling dust: layered noise streaming up the face
        float n = fbm(vec3(vW.x * 0.03, vW.y * 0.045 - uTime * 1.2, vW.z * 0.03));
        float n2 = n3(vec3(vW.x * 0.12, vW.y * 0.18 - uTime * 3.0, vW.z * 0.12));
        float top = 0.6 + 0.4 * n;
        float a = smoothstep(top, top - 0.3, t) * uDense;
        a *= 0.85 + 0.15 * n2;
        // dark brown-grey dust, darker in the folds, a little lighter on the rounded tops of the rolls
        vec3 dust = vec3(0.34, 0.27, 0.21) * (0.3 + 1.1 * n) * (0.55 + 0.45 * t);
        dust *= 0.6 + 0.6 * n2;
        // the fireball's glow on the top edge only, fading as it cools
        float rim = smoothstep(top - 0.12, top, t);
        dust += vec3(1.6, 0.6, 0.15) * rim * 0.45 * (1.0 - smoothstep(1.5, 5.0, uAge)) * (0.5 + 0.5 * n);
        // the ground torn up at the foot: near black, with rock
        dust = mix(dust, vec3(0.12, 0.1, 0.085) * (0.5 + n2), smoothstep(0.3, 0.0, t));
        gl_FragColor = vec4(dust, a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const wall = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 180, 1, true).translate(0, 0.5, 0), wallMat);
  wall.frustumCulled = false; wall.visible = false; wall.renderOrder = 5;
  scene.add(wall);

  // dust clouds riding the front (most of them on the avenue side, which is what you see), and burning debris ahead
  const R = rng(7070);
  const PUFFS = [];
  for (let i = 0; i < 110; i++) {
    const toward = i < 70;
    const a = toward ? (R() - 0.5) * 1.3 : R() * Math.PI * 2;        // 0 = toward you (+z from the hit)
    PUFFS.push({ a, back: R() * 60, r: 0.7 + R() * 0.8, hgt: R(), ph: R() * 10, sh: 0.18 + R() * 0.25 });
  }
  const DEBRIS = [];
  for (let i = 0; i < 160; i++) {
    DEBRIS.push({ a: (R() - 0.5) * 1.6, k: 1.02 + R() * 0.35, h: 0.3 + R() * 1.4, s: 1.5 + R() * 4, ph: R() * 10, hot: R() });
  }
  const dir = new THREE.Vector3();
  return {
    fireball, wall,
    frame(v, s, glows) {
      fireball.visible = wall.visible = s.hit;
      if (!s.hit) return;
      const age = s.age;
      FU.uTime.value = v; FU.uAge.value = age;
      const Rf = 270 * (1 - Math.exp(-age / 1.6));
      fireball.position.set(HIT.x, Rf * 0.5 + 8, HIT.z);
      fireball.scale.setScalar(Math.max(1, Rf));
      // the wall: a little ahead of the dust that rides it
      const Hw = 50 + 240 * smooth(0, 3.5, age);
      wall.position.set(HIT.x, 0, HIT.z);
      wall.scale.set(Math.max(1, s.front + 4), Hw, Math.max(1, s.front + 4));
      WU.uDense.value = 0.55 + 0.45 * smooth(0, 1.2, age);
      // dust riding the front
      const grow = smooth(0, 4.5, age);
      for (const p of PUFFS) {
        const rr = s.front - p.back * grow;
        if (rr < 5) continue;
        const x = HIT.x + Math.sin(p.a) * rr, z = HIT.z + Math.cos(p.a) * rr;
        const rad = (14 + 34 * grow) * p.r;
        const y = rad * 0.5 + p.hgt * (20 + 120 * grow);
        smoke.puff(x, y, z, rad, 0.8, p.sh, 0.22 * (1 - smooth(1.5, 5, age)), p.ph);
      }
      // burning debris flung ahead of the front
      for (const d of DEBRIS) {
        const rr = s.front * d.k;
        const u = clamp(rr / 700);
        const y = 6 + 160 * d.h * Math.sin(Math.PI * u) * (0.5 + 0.5 * d.k);
        const x = HIT.x + Math.sin(d.a) * rr, z = HIT.z + Math.cos(d.a) * rr;
        const dist = Math.hypot(x - glows.cam.x, z - glows.cam.z);
        if (dist < 12) continue;
        const f = 0.7 + 0.3 * Math.sin(v * 23 + d.ph);
        glows.add(x, y, z, d.s * (0.4 + dist / 300), 3.0 * f, (0.6 + 0.9 * d.hot) * f, 0.1 * f);
      }
    },
  };
}
