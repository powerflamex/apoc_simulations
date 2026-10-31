// The two ends of the hole, each built round its own origin (y = 0 is the ground, the hole at x = z = 0):
//   Madrid: the Puerta del Sol in the early afternoon: granite paving, a stone collar round the hole, people
//     leaning over the rim to watch you drop (phones out), a second row behind, the plaza's ochre buildings.
//   Wellington: a lit street at night (Cuba Street-like: two- to four-storey shops with verandas, neon, lamps,
//     the hills behind dotted with house lights), a crowd round the hole staring as you come up out of it.
import * as THREE from 'three';
import { makeOnlookers } from './people.js';
import { makeTown } from './town.js';
import { RS } from './shaft.js';
import { rng, wobble, smooth } from './util.js';

const COLLAR = 0.38;   // the stone ring round the hole: width (m)

function groundMat(night) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uSun: { value: new THREE.Vector3(0.35, 0.82, -0.45).normalize() },
      uNight: { value: night ? 1 : 0 },
      uUp: { value: 0 },            // light from the hole
      uLamp: { value: Array.from({ length: 6 }, () => new THREE.Vector4(0, -1e4, 0, 0)) },
    },
    vertexShader: 'varying vec3 vW; void main(){ vW = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: /* glsl */ `
      uniform vec3 uSun; uniform float uNight, uUp; uniform vec4 uLamp[6];
      varying vec3 vW;
      float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
      void main() {
        vec2 p = vW.xz;
        float r = length(p);
        // granite slabs 1.2 x 0.8 m (Madrid) / pavers (Wellington), joints darker
        vec2 g = p / vec2(1.2, 0.8);
        vec2 id = floor(g); vec2 f = abs(fract(g) - 0.5);
        float joint = smoothstep(0.46, 0.5, max(f.x, f.y));
        vec3 c = mix(vec3(0.62, 0.6, 0.57), vec3(0.7, 0.68, 0.64), h21(id));
        if (uNight > 0.5) c = mix(vec3(0.2, 0.2, 0.21), vec3(0.26, 0.25, 0.25), h21(id));
        c *= 1.0 - 0.35 * joint;
        // a wet-looking dark ring of stone right round the collar
        c *= 1.0 - 0.25 * smoothstep(${(RS + COLLAR + 0.8).toFixed(2)}, ${(RS + COLLAR).toFixed(2)}, r);
        vec3 lit = mix(vec3(0.5, 0.58, 0.72) + vec3(1.0, 0.95, 0.86) * 2.2 * uSun.y, vec3(0.05, 0.05, 0.07), uNight);
        for (int i = 0; i < 6; i++) { vec3 d = uLamp[i].xyz - vW; lit += vec3(1.0, 0.72, 0.42) * uLamp[i].w * max(normalize(d).y, 0.0) / (1.0 + dot(d, d) * 0.08); }
        lit += vec3(1.0, 0.92, 0.8) * uUp * 1.2 / (1.0 + r * r * 0.15);
        gl_FragColor = vec4(c * lit, 1.0);
      }`,
  });
}

function collar(night) {
  const mat = new THREE.MeshStandardMaterial({ color: night ? 0x6f6f72 : 0xb9b3a8, roughness: 0.75 });
  const top = new THREE.Mesh(new THREE.RingGeometry(RS, RS + COLLAR, 96, 1).rotateX(-Math.PI / 2).translate(0, 0.3, 0), mat);
  const out = new THREE.Mesh(new THREE.CylinderGeometry(RS + COLLAR, RS + COLLAR, 0.3, 96, 1, true).translate(0, 0.15, 0), mat);
  const inn = new THREE.Mesh(new THREE.CylinderGeometry(RS, RS, 0.32, 96, 1, true).translate(0, 0.14, 0), new THREE.MeshStandardMaterial({ color: night ? 0x8a8a8a : 0xa8a49b, roughness: 0.8, side: THREE.BackSide }));
  const g = new THREE.Group();
  g.add(top, out, inn);
  return g;
}

// ---------- Madrid ----------
export function makeMadrid() {
  const group = new THREE.Group();
  const R = rng(11);
  const ground = new THREE.Mesh(new THREE.RingGeometry(RS, 400, 128, 8).rotateX(-Math.PI / 2), groundMat(false));
  group.add(ground, collar(false));
  // people round the rim, leaning over to look down the hole; a second row behind them
  const specs = [];
  const N1 = 19;
  for (let i = 0; i < N1; i++) {
    const a = (i + 0.3 * R()) / N1 * Math.PI * 2;
    const r = RS + COLLAR + 0.22 + R() * 0.25;
    const lean = 0.28 + R() * 0.3;
    specs.push({ x: Math.cos(a) * r, z: Math.sin(a) * r, yaw: Math.atan2(-Math.cos(a), -Math.sin(a)), pitch: lean, look: -1.0 - R() * 0.4,
      armR: R() < 0.45 ? 1.0 + R() * 0.3 : 0, phone: false, armL: R() < 0.15 ? 0.6 : 0 });
    if (specs[i].armR > 0) specs[i].phone = true;
  }
  for (let i = 0; i < 15; i++) {
    const a = (i + 0.5 + 0.4 * R()) / 15 * Math.PI * 2;
    const r = RS + COLLAR + 1.2 + R() * 0.9;
    specs.push({ x: Math.cos(a) * r, z: Math.sin(a) * r, yaw: Math.atan2(-Math.cos(a), -Math.sin(a)), pitch: 0.12 + R() * 0.12, look: -0.6 - R() * 0.4,
      armR: R() < 0.35 ? 1.25 : 0, phone: false });
    if (specs[specs.length - 1].armR > 0) specs[specs.length - 1].phone = true;
  }
  const people = makeOnlookers(group, specs, { seed: 21 });
  // the plaza: a ring of ochre and cream buildings, 45-80 m out; the Casa de Correos with its clock tower
  const B = [];
  const cols = [0xd9b98a, 0xe6d3b0, 0xcf9f6a, 0xe2c79d, 0xd8a77a, 0xeadcc0, 0xc98f62];
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2 + 0.07;
    const r = 58 + R() * 16;
    const w = 16 + R() * 8;
    B.push({ x: Math.cos(a) * r, z: Math.sin(a) * r, w, h: 19 + R() * 8, d: 18, rot: -a + Math.PI / 2, kind: 0, col: cols[Math.floor(R() * cols.length)], lit: 0.1, shop: 0.8, seed: i * 0.731 });
  }
  B.push({ x: -2, z: -46, w: 54, h: 21, d: 26, rot: 0, kind: 0, col: 0xb8654a, lit: 0.1, shop: 0.6, seed: 9.1 });
  B.push({ x: -2, z: -46, w: 7, h: 33, d: 7, rot: 0, kind: 0, col: 0xe7dcc8, lit: 0.0, shop: 0.0, seed: 9.7 });
  const town = makeTown(B, { night: false });
  group.add(town.mesh);
  // the clock face on the tower
  const clock = new THREE.Mesh(new THREE.CircleGeometry(1.6, 32), new THREE.MeshBasicMaterial({ color: 0xfff6dc }));
  clock.position.set(-2, 28.5, -42.45);
  group.add(clock);
  function update(t, s) { people.update(t); }
  return { group, update, people };
}

// ---------- Wellington ----------
export const NZ_LAMPS = [];
export function makeWellington() {
  const group = new THREE.Group();
  const R = rng(37);
  const gm = groundMat(true);
  const ground = new THREE.Mesh(new THREE.RingGeometry(RS, 600, 128, 8).rotateX(-Math.PI / 2), gm);
  group.add(ground, collar(true));
  // the street runs along z; shops both sides, 2-4 storeys, verandas over the footpath
  const B = [];
  const cols = [0x9a5b3c, 0xc9b28a, 0x6d7d6a, 0xb8a27c, 0x7e4f3a, 0xd6cdb8, 0x5f6f86, 0xa88a5a, 0x8c3f2f];
  for (const side of [-1, 1]) {
    let z = 30;
    while (z > -160) {
      const w = 7 + R() * 7;
      const h = 8 + Math.floor(R() * 3) * 3.4 + R() * 1.5;
      B.push({ x: side * (9.5 + 6), z: z - w / 2, w: 12, h, d: w, kind: 1, col: cols[Math.floor(R() * cols.length)], lit: 0.45 + R() * 0.3, shop: 1, seed: (z + side * 300) * 0.0137 + 3 });
      z -= w + 0.3;
    }
  }
  // a few taller buildings behind, and the hills
  for (let i = 0; i < 10; i++) B.push({ x: (R() - 0.5) * 120, z: -170 - R() * 160, w: 18 + R() * 14, h: 22 + R() * 40, d: 18, kind: 1, col: 0x6a6e78, lit: 0.55, shop: 0.4, seed: 50 + i });
  const town = makeTown(B, { night: true });
  town.U.uAmb.value.setRGB(0.08, 0.08, 0.11);
  group.add(town.mesh);
  // verandas: a canopy over each footpath with lights underneath
  const verMat = new THREE.MeshStandardMaterial({ color: 0x2a2826, roughness: 0.8, emissive: 0x000000 });
  const verLight = new THREE.MeshBasicMaterial({ color: 0xffd9a0 });
  verLight.color.setRGB(2.2, 1.6, 0.95);
  for (const side of [-1, 1]) {
    const v = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.25, 190), verMat);
    v.position.set(side * 8.2, 3.7, -65);
    group.add(v);
    const strip = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 190).rotateX(Math.PI / 2), verLight);
    strip.position.set(side * 8.4, 3.56, -65);
    group.add(strip);
  }
  // street lamps
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x1d1f22, roughness: 0.6, metalness: 0.5 });
  const headMat = new THREE.MeshBasicMaterial({ color: 0xffe0b0 });
  headMat.color.setRGB(6, 4.6, 2.8);
  NZ_LAMPS.length = 0;
  for (let k = 0; k < 9; k++) {
    for (const side of [-1, 1]) {
      const z = 14 - k * 16 + (side > 0 ? 8 : 0);
      const x = side * 6.4;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 5.2, 8).translate(0, 2.6, 0), poleMat);
      pole.position.set(x, 0, z);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 8), headMat);
      head.position.set(x, 5.3, z);
      group.add(pole, head);
      NZ_LAMPS.push(new THREE.Vector3(x, 5.2, z));
    }
  }
  // the hills: a dark ridge with house lights, beyond the end of the street
  const hillMat = new THREE.ShaderMaterial({
    vertexShader: 'varying vec3 vW; void main(){ vW = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: /* glsl */ `
      varying vec3 vW;
      float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
      void main() {
        vec2 g = floor(vW.xy / vec2(9.0, 6.0));
        float on = step(0.8, h21(g)) * step(0.4, fract(vW.x / 9.0)) * step(fract(vW.x / 9.0), 0.7) * step(0.3, fract(vW.y / 6.0)) * step(fract(vW.y / 6.0), 0.65);
        vec3 c = vec3(0.012, 0.016, 0.02) + vec3(1.0, 0.75, 0.45) * on * 1.6 * (0.6 + 0.6 * h21(g + 3.0));
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  const hg = new THREE.PlaneGeometry(2600, 400, 160, 20);
  const pa = hg.attributes.position;
  for (let i = 0; i < pa.count; i++) {
    const x = pa.getX(i), y = pa.getY(i);
    const top = 120 + 70 * Math.sin(x / 260 + 1) + 40 * Math.sin(x / 90 + 3) + 20 * Math.sin(x / 37);
    pa.setY(i, (y + 200) / 400 * top);
  }
  hg.computeVertexNormals();
  const hills = new THREE.Mesh(hg, hillMat);
  hills.position.set(0, 0, -900);
  group.add(hills);
  // the crowd round the hole, staring; some step back, phones up
  const specs = [];
  for (let i = 0; i < 26; i++) {
    const a = (i + 0.4 * R()) / 26 * Math.PI * 2;
    // keep the side toward the camera (+z) a bit clearer
    if (Math.abs(a - Math.PI / 2) < 0.55) continue;     // keep the view from the camera (+z) clear
    const r = RS + COLLAR + 0.5 + R() * 2.4;
    specs.push({ x: Math.cos(a) * r, z: Math.sin(a) * r, yaw: Math.atan2(-Math.cos(a), -Math.sin(a)), pitch: 0.04 + R() * 0.08, look: -0.5,
      armR: R() < 0.5 ? 1.0 + R() * 0.25 : 0, armL: R() < 0.12 ? 1.5 : 0, phone: false, dist: r });
    if (specs[specs.length - 1].armR > 0) specs[specs.length - 1].phone = true;
  }
  // a few further away, walking over to look
  for (let i = 0; i < 10; i++) {
    const x = (R() - 0.5) * 10, z = -10 - R() * 25;
    specs.push({ x, z, yaw: Math.atan2(-x, -z), pitch: 0.05, look: 0, armR: R() < 0.3 ? 1.1 : 0, phone: false, dist: Math.hypot(x, z) });
  }
  const people = makeOnlookers(group, specs, { seed: 77 });
  // the light coming up out of the hole: a soft column you can see
  const colMat = new THREE.ShaderMaterial({
    uniforms: { uOn: { value: 1 } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    vertexShader: 'varying vec3 vP; varying vec3 vN; varying vec3 vV; void main(){ vP = position; vec4 mv = modelViewMatrix * vec4(position, 1.0); vV = normalize(-mv.xyz); vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * mv; }',
    fragmentShader: 'uniform float uOn; varying vec3 vP; varying vec3 vN; varying vec3 vV; void main(){ float k = clamp(vP.y / 30.0, 0.0, 1.0); float edge = pow(abs(dot(vN, vV)), 2.0); gl_FragColor = vec4(vec3(1.0, 0.9, 0.75) * uOn * 0.05 * edge * pow(1.0 - k, 2.0), 1.0); }',
  });
  const column = new THREE.Mesh(new THREE.CylinderGeometry(RS * 1.15, RS, 30, 48, 1, true).translate(0, 15, 0), colMat);
  group.add(column);
  // lights for the people: the hole's glow from below, and the nearest lamps
  const upLight = new THREE.PointLight(0xffe7c8, 60, 30, 1.6);
  upLight.position.set(0, -0.6, 0);
  group.add(upLight);
  const lampLights = [0, 1, 2].map((i) => { const l = new THREE.PointLight(0xffb870, 25, 26, 1.8); l.position.copy(NZ_LAMPS[i]); group.add(l); return l; });
  function update(t, s, youY) {
    // heads follow you: down into the hole while you're under, up at you as you come out
    specs.forEach((p) => {
      const eye = 1.55;
      const target = youY + 1.4;            // your helmet
      p.look = Math.atan2(target - eye, Math.max(1, p.dist - 0.3)) / 0.55 * 0.9;
      p.look = Math.max(-1.4, Math.min(1.2, p.look));
    });
    people.update(t);
    const lamps = [...NZ_LAMPS].slice(0, 6);
    lamps.forEach((l, i) => { town.U.uLamp.value[i].set(l.x, l.y, l.z, 2.2); gm.uniforms.uLamp.value[i].set(l.x, l.y, l.z, 1.6); });
    town.U.uUp.value.set(0, -0.5, 0, 5);
    gm.uniforms.uUp.value = 1;
  }
  return { group, update, people, column, upLight };
}
