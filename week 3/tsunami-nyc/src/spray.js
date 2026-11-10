// The spray thrown ahead of the wave when it hits: when its foot slams into the seawall, sheets and drops of water
// burst off it and fly over the promenade faster than the wave itself (70-95 m/s), straight past and into the
// camera a moment before the water arrives. GPU streaks, all closed form in time: each drop leaves the wave's front
// at its emit time and flies in a straight-ish arc; drawn as a quad from where it is to where it was 1/40 s ago
// (motion blur), so near the lens they are long white smears.
import * as THREE from 'three';
import { rng } from './util.js';
import { V_HIT, SPEED } from './timeline.js';

export function makeSpray(scene, { camX = 0 } = {}) {
  const R = rng(777);
  const N = 1300;
  const A = new Float32Array(N * 4), Bv = new Float32Array(N * 4);
  for (let i = 0; i < N; i++) {
    const big = R() < 0.15;
    // where it leaves the wave (x, height), when (video time), its speed
    const x0 = camX + (R() - 0.5) * 2 * (2 + 40 * Math.pow(R(), 1.6));
    A.set([x0, 0.5 + Math.pow(R(), 1.3) * (big ? 8 : 14), V_HIT - 0.02 + R() * 0.45, 64 + R() * 20], i * 4);
    Bv.set([(R() - 0.5) * 8, 1 + R() * 7, big ? 0.12 + R() * 0.2 : 0.02 + R() * 0.06, R()], i * 4);
  }
  const base = new THREE.BufferGeometry();
  base.setAttribute('position', new THREE.Float32BufferAttribute([0, -1, 0, 0, 1, 0, 1, -1, 0, 1, 1, 0], 3));
  base.setIndex([0, 2, 1, 1, 2, 3]);
  const geo = new THREE.InstancedBufferGeometry();
  geo.index = base.index; geo.attributes.position = base.attributes.position;
  geo.setAttribute('aA', new THREE.InstancedBufferAttribute(A, 4));
  geo.setAttribute('aB', new THREE.InstancedBufferAttribute(Bv, 4));
  geo.instanceCount = N;
  const u = { uT: { value: 0 }, uSpeed: { value: SPEED }, uHit: { value: V_HIT }, uLight: { value: 1 } };
  const mat = new THREE.ShaderMaterial({
    uniforms: u, transparent: true, depthWrite: false,
    vertexShader: /* glsl */ `
      attribute vec4 aA; attribute vec4 aB;
      uniform float uT; uniform float uSpeed; uniform float uHit;
      varying vec2 vUv; varying float vA;
      vec3 posAt(float t) {
        float dt = t - aA.z;
        float z0 = -uSpeed * (uHit - aA.z);          // the wave's front when it left it
        return vec3(aA.x + aB.x * dt, aA.y + aB.y * dt - 4.9 * dt * dt, z0 + 2.0 + aA.w * dt);
      }
      void main() {
        float dt = uT - aA.z;
        if (dt < 0.0 || dt > 0.7) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
        vec3 H = posAt(uT), T = posAt(uT - 1.0 / 40.0);
        vec4 hv = viewMatrix * vec4(H, 1.0), tv = viewMatrix * vec4(T, 1.0);
        // (anything already behind the lens is gone)
        if (hv.z > -0.15) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
        if (tv.z > -0.15) tv.xyz = mix(hv.xyz, tv.xyz, (-0.15 - hv.z) / (tv.z - hv.z));
        vec3 d = tv.xyz - hv.xyz;
        float len = length(d);
        vec3 dir = len > 1e-4 ? d / len : vec3(0.0, 1.0, 0.0);
        float size = aB.z;
        if (len < size) { tv.xyz = hv.xyz + dir * size; }
        vec3 side = normalize(cross(dir, normalize(hv.xyz + 1e-4)));
        vec3 P = mix(hv.xyz, tv.xyz, position.x) + side * position.y * size * 0.5;
        vUv = position.xy;
        vA = smoothstep(0.0, 0.04, dt) * (1.0 - smoothstep(0.5, 0.7, dt)) * (0.55 + 0.45 * aB.w);
        gl_Position = projectionMatrix * vec4(P, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform float uLight;
      varying vec2 vUv; varying float vA;
      void main() {
        float a = vA * exp(-vUv.y * vUv.y * 3.0) * (1.0 - 0.75 * vUv.x) * 0.7;
        gl_FragColor = vec4(vec3(0.9, 0.94, 0.94) * uLight, a);
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false; mesh.renderOrder = 8;
  scene.add(mesh);
  return { u, mesh, frame(v) { u.uT.value = v; mesh.visible = v > V_HIT - 0.05 && v < V_HIT + 1.2; } };
}
