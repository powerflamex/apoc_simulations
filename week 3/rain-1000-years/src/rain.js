// The rain near the camera: thin falling streaks (motion-blurred drops) in a box that travels with the camera,
// lit by the sky and catching the street lights and lightning. Drops fall at ~9 m/s on a slant (the wind), in real
// time whatever the time-lapse is doing. (Far rain is a haze: the fog, plus the rain sheets in the post pass.)
import * as THREE from 'three';
import { rng } from './util.js';

export function makeRain(scene, n = 9000) {
  const R = rng(99);
  const geo = new THREE.PlaneGeometry(1, 1);
  const a = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) a.set([R(), R(), R(), R()], i * 4);
  geo.setAttribute('aR', new THREE.InstancedBufferAttribute(a, 4));
  const u = {
    uTime: { value: 0 }, uBox: { value: new THREE.Vector3(30, 18, 30) }, uCam: { value: new THREE.Vector3() },
    uFwd: { value: new THREE.Vector3(0, 0, -1) }, uLight: { value: new THREE.Color(0.5, 0.52, 0.58) }, uWind: { value: new THREE.Vector2(0.6, 0.15) },
    uLevel: { value: 0 }, uK: { value: 1 }, uSnow: { value: 0 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms: u, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      attribute vec4 aR; uniform float uTime; uniform vec3 uBox; uniform vec3 uCam; uniform vec3 uFwd; uniform vec2 uWind; uniform float uLevel;
      varying vec2 vUv; varying float vA;
      void main() {
        vUv = uv;
        // drops fixed in the world, in a box ahead of the camera that they wrap around in (so turning the camera
        // or moving it never makes them jump)
        vec3 fw = normalize(vec3(uFwd.x, 0.001, uFwd.z));
        float speed = 8.5 + 2.0 * aR.w;
        vec3 vel = vec3(uWind.x, -speed, uWind.y);
        vec3 Bx = uBox;
        vec3 ctr = uCam + fw * (Bx.z * 0.42) + vec3(0.0, Bx.y * 0.1, 0.0);
        vec3 p0 = aR.xyz * Bx + vel * uTime;
        vec3 c = mod(p0 - (ctr - Bx * 0.5), Bx) + ctr - Bx * 0.5;
        float depth = dot(c - uCam, fw);
        // a streak: the distance a drop falls in ~1/60 s (the shutter), turned to face the camera
        vec3 toC = normalize(cameraPosition - c);
        vec3 axis = normalize(vel);
        vec3 side = normalize(cross(axis, toC));
        float len = speed * 0.022, wid = 0.008 + 0.006 * aR.w;
        vec3 w = c + axis * position.y * len + side * position.x * wid * (1.0 + length(cameraPosition - c) * 0.08);
        vA = (c.y > uLevel ? 1.0 : 0.0) * smoothstep(0.6, 2.5, length(cameraPosition - c)) * smoothstep(0.0, 2.0, depth) * (1.0 - smoothstep(0.65, 0.92, depth / Bx.z));
        gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uLight; uniform float uK; varying vec2 vUv; varying float vA;
      void main() {
        float a = (1.0 - abs(vUv.x * 2.0 - 1.0)) * smoothstep(0.0, 0.3, vUv.y) * smoothstep(1.0, 0.7, vUv.y);
        gl_FragColor = vec4(uLight * a * vA * 0.32 * uK, 1.0);
      }`,
  });
  const mesh = new THREE.InstancedMesh(geo, mat, n);
  mesh.frustumCulled = false; mesh.renderOrder = 7;
  scene.add(mesh);
  return {
    u, mesh,
    frame(v, cam, level) {
      u.uTime.value = v;
      u.uCam.value.copy(cam.position);
      cam.getWorldDirection(u.uFwd.value);
      u.uLevel.value = level;
    },
  };
}
