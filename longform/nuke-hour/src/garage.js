// The underground garage at the park's edge, 45 minutes in: two floors of concrete and earth overhead, the power out,
// battery lamps on the pillars, people sitting along the walls and between the cars, a car with its doors open and its
// radio on (the emergency broadcast). The ramp climbs to the street, where the fires glow orange; at the end the
// sirens' red and blue lights sweep down it. Its own scene; the camera is shared with the world.
import * as THREE from 'three';
import { makeCrowd, SKIN, HAIR } from './crowd.js';
import { makeFleet } from './cars.js';
import { rng, smooth, clamp, wobble } from './util.js';

const W = 64, Z0 = -46, Z1 = 8, HT = 2.8;
export const RAMP = { z0: 8, z1: 26, top: 3.6, x: 0, w: 7 };
export const RADIO_CAR = { x: 6.6, z: -10 };

const SHIRTS = [0x1d2230, 0xe8e2d6, 0x3a3328, 0x6b5a44, 0xc8d4e8, 0x7a2a2a, 0x24384a, 0xf0c060, 0x2f3d2c, 0xb8b0a0, 0x15151a, 0x8a5a8a, 0xd05030, 0x3a4a6a];
const PANTS = [0x15161a, 0x23252b, 0x2c3340, 0x4a4238, 0x1a1a1a, 0x3a3a40, 0x8a7a66];

export function makeGarage(ctx) {
  const R = rng(2727);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), sc = new THREE.Vector3(1, 1, 1);
  const concrete = ctx.plainMat(0x77736c, 0.95);
  // floor with bays painted on it
  const floorMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7 });
  floorMat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vGW;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvGW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      varying vec3 vGW; float gh(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
      float gn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(gh(i), gh(i + vec2(1, 0)), f.x), mix(gh(i + vec2(0, 1)), gh(i + vec2(1, 1)), f.x), f.y); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
      { vec3 c = vec3(0.26, 0.25, 0.24) * (0.8 + 0.3 * gn(vGW.xz * 0.6)) * (0.85 + 0.2 * gn(vGW.xz * 4.0));
        // bay lines either side of the middle lane, a yellow arrow line down the lane
        float bx = abs(vGW.x);
        float bay = step(4.0, bx) * step(bx, 9.5) * (1.0 - smoothstep(0.05, 0.09, abs(fract(vGW.z / 2.7 + 0.5) - 0.5) * 2.7));
        float edge = 1.0 - smoothstep(0.05, 0.09, abs(bx - 4.0));
        float mid = (1.0 - smoothstep(0.06, 0.1, bx)) * step(0.5, fract(vGW.z / 3.0));
        c = mix(c, vec3(0.75, 0.72, 0.66), max(bay, edge) * 0.8);
        c = mix(c, vec3(0.8, 0.62, 0.1), mid);
        diffuseColor.rgb = c; }`);
  };
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, Z1 - Z0).rotateX(-Math.PI / 2), floorMat);
  floor.position.set(0, 0, (Z0 + Z1) / 2); floor.receiveShadow = true;
  scene.add(floor);
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(W, Z1 - Z0).rotateX(Math.PI / 2), concrete);
  ceil.position.set(0, HT, (Z0 + Z1) / 2);
  scene.add(ceil);
  const box = (w, h, d, x, y, z, mat = concrete) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; scene.add(m); return m; };
  box(0.5, HT, Z1 - Z0, -W / 2, HT / 2, (Z0 + Z1) / 2); box(0.5, HT, Z1 - Z0, W / 2, HT / 2, (Z0 + Z1) / 2);
  box(W, HT, 0.5, 0, HT / 2, Z0);
  // the front wall with the ramp's opening, beams across the ceiling, pillars
  box((W - RAMP.w) / 2, HT, 0.5, -(W + RAMP.w) / 4, HT / 2, Z1); box((W - RAMP.w) / 2, HT, 0.5, (W + RAMP.w) / 4, HT / 2, Z1);
  for (let z = Z0 + 6; z < Z1; z += 8) box(W, 0.45, 0.5, 0, HT - 0.22, z);
  const PILLARS = [];
  for (let x = -24; x <= 24; x += 12) for (let z = Z0 + 6; z < Z1 - 2; z += 8) if (Math.abs(x) > 1) { PILLARS.push([x, z]); box(0.7, HT, 0.7, x, HT / 2, z); }
  // the ramp up to the street and the street's orange glow at the top
  const rampLen = Math.hypot(RAMP.z1 - RAMP.z0, RAMP.top);
  const ramp = new THREE.Mesh(new THREE.PlaneGeometry(RAMP.w, rampLen).rotateX(-Math.PI / 2 - Math.atan2(RAMP.top, RAMP.z1 - RAMP.z0)), concrete);
  ramp.position.set(0, RAMP.top / 2, (RAMP.z0 + RAMP.z1) / 2); ramp.receiveShadow = true;
  scene.add(ramp);
  box(0.5, HT + RAMP.top, RAMP.z1 - RAMP.z0, -RAMP.w / 2 - 0.25, (HT + RAMP.top) / 2, (RAMP.z0 + RAMP.z1) / 2);
  box(0.5, HT + RAMP.top, RAMP.z1 - RAMP.z0, RAMP.w / 2 + 0.25, (HT + RAMP.top) / 2, (RAMP.z0 + RAMP.z1) / 2);
  const rc = new THREE.Mesh(new THREE.PlaneGeometry(RAMP.w + 1, RAMP.z1 - RAMP.z0 - 4).rotateX(Math.PI / 2), concrete);
  rc.position.set(0, HT + RAMP.top * 0.5, (RAMP.z0 + RAMP.z1) / 2 - 2); scene.add(rc);
  const outMat = new THREE.ShaderMaterial({
    uniforms: { uT: { value: 0 }, uSiren: { value: new THREE.Color(0, 0, 0) } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform float uT; uniform vec3 uSiren; varying vec2 vUv;
      void main(){ float y = vUv.y; vec3 c = mix(vec3(1.6, 0.55, 0.12), vec3(0.18, 0.06, 0.03), smoothstep(0.1, 0.9, y));
        c *= 0.8 + 0.2 * sin(uT * 3.0 + vUv.x * 7.0) * sin(uT * 1.7);
        gl_FragColor = vec4(c + uSiren * (1.0 - y) * 1.5, 1.0); }`,
  });
  const outside = new THREE.Mesh(new THREE.PlaneGeometry(RAMP.w + 2, 8), outMat);
  outside.position.set(0, RAMP.top + 3, RAMP.z1 + 0.5); outside.rotation.y = Math.PI;
  scene.add(outside);
  // (the plane faces back down the ramp: rotation y PI faces -z)
  outside.rotation.y = 0;
  outside.position.z = RAMP.z1 + 2;

  // parked cars along the bays
  const SPOTS = [];
  for (const sd of [-1, 1]) for (let z = Z0 + 3; z < Z1 - 2; z += 2.7) if (R() < 0.6 || (sd > 0 && Math.abs(z - RADIO_CAR.z) < 1.4)) SPOTS.push({ x: sd * 6.6, z, yaw: sd * Math.PI / 2 + (R() - 0.5) * 0.06 });
  for (const sd of [-1, 1]) for (let z = Z0 + 3; z < Z1 - 2; z += 2.7) if (R() < 0.5) SPOTS.push({ x: sd * 18.6, z, yaw: sd * Math.PI / 2 });
  const radio = SPOTS.reduce((b, s0) => (Math.hypot(s0.x - RADIO_CAR.x, s0.z - RADIO_CAR.z) < Math.hypot(b.x - RADIO_CAR.x, b.z - RADIO_CAR.z) ? s0 : b));
  const fleet = makeFleet(scene, SPOTS.length, ctx);
  const PAINT = [0xe8e8e8, 0x2a2c30, 0x8a1f22, 0x9aa0a8, 0x1c2e4a, 0x111111, 0x6a6e72, 0xc9c2b0, 0x30402e];
  SPOTS.forEach((s0, i) => {
    fleet.color(i, PAINT[Math.floor(R() * PAINT.length)], [0, 1, 2, 2, 3][Math.floor(R() * 5)]);
    e.set(0, s0.yaw, 0);
    fleet.set(i, m4.compose(p.set(s0.x, 0, s0.z), q.setFromEuler(e), sc), false);
  });
  fleet.commit();

  // battery lamps on the pillars (a few dead), their light
  const LAMPS = PILLARS.filter(() => R() < 0.55).map(([x, z]) => ({ x: x + 0.4, z, on: true }));
  const lampMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(3.5, 3.6, 3.9) });
  const lamps = new THREE.InstancedMesh(new THREE.BoxGeometry(0.3, 0.1, 0.12), lampMat, LAMPS.length);
  LAMPS.forEach((l, i) => lamps.setMatrixAt(i, m4.makeTranslation(l.x, 2.2, l.z)));
  scene.add(lamps);
  const lights = [new THREE.PointLight(0xdfe6ff, 14, 0, 1.6), new THREE.PointLight(0xdfe6ff, 14, 0, 1.6), new THREE.PointLight(0xdfe6ff, 12, 0, 1.6),
    new THREE.PointLight(0xffc890, 6, 0, 1.6), new THREE.PointLight(0xff7a2a, 0, 0, 1.3), new THREE.PointLight(0xff2020, 0, 0, 1.3), new THREE.PointLight(0x2050ff, 0, 0, 1.3)];
  lights[0].position.set(-11.6, 2.2, -10); lights[1].position.set(12.4, 2.2, -26); lights[2].position.set(0.4, 2.2, 2);
  lights[3].position.set(radio.x - 1.6, 1.2, radio.z);        // the open car's dome light
  lights[4].position.set(0, 4, RAMP.z1 - 2);                    // the street glow at the top of the ramp
  lights[5].position.set(-1.5, 3, RAMP.z0 + 2); lights[6].position.set(1.5, 3, RAMP.z0 + 2);
  scene.add(...lights);
  scene.add(new THREE.HemisphereLight(0x1a1c22, 0x0c0b0a, 0.5));
  // the open car's door (a slab swung out) and its lit dash
  const doorM = box(0.08, 1.0, 1.1, radio.x - 1.6, 0.9, radio.z + 1.0, ctx.plainMat(0x2a2c30, 0.4, { metalness: 0.4 }));
  doorM.rotation.y = 1.0;

  // the people
  const P = [];
  const add = (x, z, o) => P.push({ x, z, s: 0.92 + R() * 0.14, ph: R() * 10, ...o });
  const free = (x, z) => P.every((o) => (o.x - x) ** 2 + (o.z - z) ** 2 > 0.85) && SPOTS.every((s0) => Math.abs(s0.x - x) > 1.3 || Math.abs(s0.z - z) > 2.6) && PILLARS.every(([px, pz]) => (px - x) ** 2 + (pz - z) ** 2 > 0.7);
  // along the walls, sitting; groups standing in the lane; a few round the radio car
  for (let k = 0; k < 900 && P.length < 70; k++) {
    const wall = R() < 0.45;
    const x = wall ? (R() < 0.5 ? -1 : 1) * (W / 2 - 0.7) : (R() - 0.5) * 30, z = Z0 + 2 + R() * (Z1 - Z0 - 6);
    if (Math.abs(x) < 2.2 && z > -24) continue;                 // (your way in, down the middle lane)
    if (!free(x, z)) continue;
    add(x, z, { act: wall || R() < 0.5 ? 'sit' : 'stand', yaw: wall ? (x < 0 ? Math.PI / 2 : -Math.PI / 2) : R() * 6.28 });
  }
  for (let k = 0; k < 7; k++) { const a = k / 7 * Math.PI * 1.4 - 0.4; const x = radio.x - 2.6 + Math.cos(a) * 1.6, z = radio.z + Math.sin(a) * 1.8; if (free(x, z)) add(x, z, { act: k % 2 ? 'sit' : 'stand', yaw: Math.atan2(radio.x - 1.6 - x, radio.z - z) }); }
  const crowd = makeCrowd(scene, P.length, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85 }));
  P.forEach((o, i) => { o.i = i; crowd.color(i, SHIRTS[Math.floor(R() * SHIRTS.length)], PANTS[Math.floor(R() * PANTS.length)], SKIN[Math.floor(R() * SKIN.length)], HAIR[Math.floor(R() * HAIR.length)]); });
  // flashlights: a few people hold one (a glow and a soft beam on the floor)
  const TORCH = P.filter((o, i) => i % 9 === 0).slice(0, 6);

  return {
    scene, radio,
    // v: video time; s.sirens 0..1 at the end, s.stand: people getting up to look at the ramp
    frame(v, s, glows) {
      outMat.uniforms.uT.value = v;
      const sir = s.sirens || 0;
      const ph = v * 5.2;
      const red = sir * (Math.sin(ph) > 0.35 ? 1 : 0.05), blue = sir * (Math.sin(ph) < -0.35 ? 1 : 0.05);
      outMat.uniforms.uSiren.value.setRGB(2.6 * red, 0.08 * red + 0.25 * blue, 2.8 * blue);
      lights[4].intensity = 90 * (0.8 + 0.2 * Math.sin(v * 3));
      lights[5].intensity = 160 * red; lights[6].intensity = 160 * blue;
      LAMPS.forEach((l) => glows.add(l.x, 2.2, l.z, 0.55, 2.2, 2.3, 2.6));
      glows.add(radio.x - 1.6, 1.1, radio.z, 0.8, 1.8, 1.2, 0.6);
      for (const o of P) {
        let yaw = o.yaw, sit = 0, look = 0.1, armL = 0, armR = 0;
        if (o.act === 'sit') { sit = 1; armL = armR = 0.45; look = 0.0; }
        // when the sirens come, the ones standing turn to the ramp
        const turn = smooth(0, 1.5, (s.sirT || -1) - (o.ph % 1) * 1.2);
        if (o.act === 'stand' && turn > 0) yaw = yaw + (Math.atan2(0 - o.x, RAMP.z0 - o.z) - yaw) * turn;
        yaw += wobble(v * 0.25, o.ph) * 0.1;
        crowd.pose(o.i, { x: o.x, y: 0, z: o.z, yaw, s: o.s, sit, armL, armR, look });
      }
      crowd.commit();
      for (const o of TORCH) {
        const fx = o.x + Math.sin(o.yaw) * 0.45, fz = o.z + Math.cos(o.yaw) * 0.45;
        glows.add(fx, o.act === 'sit' ? 0.75 : 1.2, fz, 0.35, 3, 2.9, 2.6);
        glows.add(fx + Math.sin(o.yaw) * 2.2, 0.04, fz + Math.cos(o.yaw) * 2.2, 1.6, 0.25, 0.24, 0.22);
      }
    },
  };
}
