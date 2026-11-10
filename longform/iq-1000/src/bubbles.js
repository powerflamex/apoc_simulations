// Giant soap bubbles from the bubble artist's rope, as a pure function of world time w. They drift east on the
// breeze, wobble, and pop: the film tears open from one point and the hole races around the bubble (~10 m/s, so a
// big one is gone in ~30 ms: a blink, or half a minute at 1,000x). One of them (the hero) drifts to just in front
// of you at the curb and is the one that pops at W.burst.
import * as THREE from 'three';
import { rng, smooth, clamp } from './util.js';
import { W } from './timeline.js';
import { BUBBLER, YOU1, EYE } from './layout.js';

const WAND = { x: BUBBLER.x + 0.45, y: 2.35, z: BUBBLER.z + 0.3 };
const POP = 0.03;   // seconds for the film to tear all the way round

const VERT = /* glsl */ `
  uniform float uW, uSeed, uR;
  varying vec3 vN; varying vec3 vWP; varying vec3 vL;
  void main() {
    vec3 p = position;
    // the film wobbles: slow standing waves
    float wob = 0.035 * sin(3.0 * p.x + uW * 2.1 + uSeed) * sin(2.0 * p.y + uW * 1.7) + 0.03 * sin(4.0 * p.z + uW * 2.7 + uSeed * 2.0);
    p *= 1.0 + wob;
    p.y *= 0.94;
    vL = position;
    vec4 wp = modelMatrix * vec4(p * uR, 1.0);
    vWP = wp.xyz;
    vN = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * wp;
  }`;
const FRAG = /* glsl */ `
  uniform float uW, uSeed, uBurst, uLight, uFlash; uniform vec3 uHole; uniform vec3 uSunDir;
  varying vec3 vN; varying vec3 vWP; varying vec3 vL;
  vec3 film(float t) {   // thin-film interference colours for a thickness t (0..1)
    return 0.5 + 0.5 * cos(6.2832 * (vec3(0.0, 0.33, 0.67) + t * 2.2));
  }
  void main() {
    vec3 n = normalize(vN);
    vec3 v = normalize(cameraPosition - vWP);
    float nv = abs(dot(n, v));
    // the hole: everything within the tear's angle is gone; a bright rim of gathering soap at its edge
    float ang = acos(clamp(dot(normalize(vL), uHole), -1.0, 1.0));
    float edge = uBurst * 3.3;
    if (uBurst > 0.0 && ang < edge) discard;
    float rim = uBurst > 0.0 ? smoothstep(0.16, 0.0, ang - edge) : 0.0;
    // swirling thickness bands
    float th = 0.5 + 0.25 * sin(vL.y * 5.0 + uW * 0.8 + uSeed) + 0.2 * sin(vL.x * 7.0 - uW * 1.1 + vL.z * 3.0) + 0.3 * (1.0 - nv);
    vec3 col = film(th) * (0.25 + 0.75 * pow(1.0 - nv, 1.5));
    float a = 0.05 + 0.55 * pow(1.0 - nv, 2.5);
    // reflections: the sky's highlight and a window-like glint
    vec3 rf = reflect(-v, n);
    float hi = pow(max(dot(rf, uSunDir), 0.0), 120.0) * 3.0 + pow(max(rf.y, 0.0), 6.0) * 0.25;
    col += vec3(hi);
    a += hi * 0.5;
    col += vec3(1.0) * rim * 1.4; a = max(a, rim * 0.8);
    col *= uLight; col += vec3(0.8, 0.85, 1.0) * uFlash * (0.6 + rim);
    gl_FragColor = vec4(col, clamp(a, 0.0, 0.95));
  }`;

export function makeBubbles(scene) {
  const r = rng(321);
  const list = [];
  // the artist's bubbles: one every ~2.4 s; they pop before reaching the walkway at x = -1
  for (let t0 = -12; t0 < 100; t0 += 1.8 + r() * 1.4) {
    const vx = 0.38 + r() * 0.16, life = Math.min(6 + r() * 5, (-1.2 - WAND.x) / vx);
    list.push({ t0, life, R: 0.24 + r() * 0.24, vx, vy: -0.06 + r() * 0.14, vz: -0.22 + r() * 0.3, seed: r() * 50, hole: new THREE.Vector3(r() - 0.5, r() - 0.5, r() - 0.5).normalize() });
  }
  // the hero: from the rope to 1.2 m in front of your eyes at the curb (launched ~9.6 s before it pops)
  const H0 = W.burst - 9.6, H1 = W.burst;
  // keep the artist's air clear around the hero's launch
  for (const b of list) if (Math.abs(b.t0 - H0) < 1.6) b.t0 -= 3.2;
  const HEND = { x: YOU1.x - 0.12, y: EYE - 0.06, z: YOU1.z - 1.2 };
  const hero = { t0: H0, life: H1 - H0 + POP, R: 0.36, seed: 7.7, hole: new THREE.Vector3(-0.35, 0.25, 0.9).normalize(), hero: true };
  list.push(hero);
  const geo = new THREE.SphereGeometry(1, 56, 40);
  const meshes = list.map((b) => {
    const mat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, side: THREE.DoubleSide,
      uniforms: { uW: { value: 0 }, uSeed: { value: b.seed }, uR: { value: b.R }, uBurst: { value: 0 }, uHole: { value: b.hole }, uSunDir: { value: new THREE.Vector3(0.3, 0.6, 0.75).normalize() }, uLight: { value: 1 }, uFlash: { value: 0 } },
    });
    const m = new THREE.Mesh(geo, mat);
    m.renderOrder = 6;
    m.frustumCulled = false;
    scene.add(m);
    return m;
  });
  function posOf(b, w) {
    const dt = w - b.t0;
    if (b.hero) {
      const k = clamp(dt / (H1 - H0));
      const ke = k * k * (3 - 2 * k) * 0.35 + k * 0.65;
      return {
        x: WAND.x + (HEND.x - WAND.x) * ke + 0.12 * Math.sin(dt * 0.9),
        y: WAND.y + (HEND.y - WAND.y) * ke + 0.08 * Math.sin(dt * 0.7 + 1),
        z: WAND.z + (HEND.z - WAND.z) * ke + 0.1 * Math.sin(dt * 0.6 + 2),
      };
    }
    // grows off the rope for the first second, then drifts
    return { x: WAND.x + b.vx * dt, y: WAND.y + b.vy * dt + 0.05 * Math.sin(dt * 0.8 + b.seed), z: WAND.z + b.vz * dt + 0.06 * Math.sin(dt * 0.5 + b.seed) };
  }
  return {
    hero, list,
    heroPos: (w) => posOf(hero, w),
    frame(w, s, sunDir) {
      list.forEach((b, i) => {
        const m = meshes[i], dt = w - b.t0;
        const popAt = b.life - POP;
        if (dt < 0 || dt > b.life) { m.visible = false; return; }
        m.visible = true;
        const p = posOf(b, w);
        const grow = b.hero ? 1 : smooth(0, 0.9, dt);
        m.position.set(p.x, p.y, p.z);
        // stretched a little along its drift while it's young
        m.scale.set(grow * (1 + 0.15 * (1 - grow)), grow, grow);
        const u = m.material.uniforms;
        u.uW.value = w; u.uBurst.value = dt > popAt ? clamp((dt - popAt) / POP) : 0;
        u.uLight.value = 1 - 0.45 * s.sunDim; u.uFlash.value = s.flash;
        u.uSunDir.value.copy(sunDir);
      });
    },
  };
}
