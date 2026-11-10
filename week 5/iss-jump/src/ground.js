// The one quick cutaway (1.5 s): two people on a dark hill at dusk look up at a shooting star crossing the sky.
// A sky dome (dusk gradient, stars, the fireball's streak drawn as a glowing head with a fading tail) and two
// silhouetted figures (crowd.js) lit faintly by the streak.
import * as THREE from 'three';
import { makeCrowd } from './crowd.js';
import { smooth, clamp } from './util.js';

export function makeGround() {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, 1080 / 1920, 0.1, 1200);
  const U = { uHead: { value: new THREE.Vector3(0, 1, 0) }, uTail: { value: new THREE.Vector3(0, 1, 0) }, uBright: { value: 0 }, uPx: { value: 0.001 } };
  const sky = new THREE.Mesh(new THREE.SphereGeometry(900, 48, 32), new THREE.ShaderMaterial({
    uniforms: U, side: THREE.BackSide, depthWrite: false,
    vertexShader: `varying vec3 vD; void main(){ vD = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform vec3 uHead, uTail; uniform float uBright, uPx; varying vec3 vD;
      float h13(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
      void main(){
        vec3 d = normalize(vD);
        float h = d.y;
        // dusk: orange-pink at the horizon, deep blue above
        vec3 c = mix(vec3(0.55, 0.25, 0.12), vec3(0.02, 0.035, 0.1), smoothstep(-0.05, 0.45, h));
        c = mix(c, vec3(0.9, 0.5, 0.25), smoothstep(0.06, -0.02, h) * 0.6 * smoothstep(-0.6, 0.6, -d.z));
        // stars
        float sc = 160.0; vec3 p = d * sc; vec3 i = floor(p);
        float hh = h13(i);
        if (hh > 0.975 && h > 0.0) { vec3 cc = i + 0.5 + (vec3(h13(i + 1.3), h13(i + 2.7), h13(i + 4.1)) - 0.5) * 0.7; float dd = length(p - cc) / sc;
          c += vec3(0.9, 0.92, 1.0) * (pow(h13(i + 9.9), 3.0) * 2.0 + 0.2) * exp(-dd * dd / (uPx * uPx * 0.9)) * smoothstep(0.0, 0.35, h); }
        // the shooting star: a bright head and a tail fading back along its path
        float g = 0.0;
        for (int k = 0; k < 40; k++) {
          float t = float(k) / 39.0;
          vec3 q = normalize(mix(uTail, uHead, t));
          float a = acos(clamp(dot(d, q), -1.0, 1.0));
          float w = 0.004 + 0.006 * (1.0 - t);
          g += exp(-a * a / (w * w)) * (0.06 + 0.94 * pow(t, 2.5)) * 0.45;
        }
        float ah = acos(clamp(dot(d, uHead), -1.0, 1.0));
        g += exp(-ah * ah / 0.00006) * 4.0 + exp(-ah / 0.05) * 0.9;
        c += mix(vec3(1.0, 0.6, 0.3), vec3(1.0, 0.95, 0.85), smoothstep(0.3, 2.0, g)) * g * uBright;
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  }));
  sky.frustumCulled = false;
  scene.add(sky);
  // the hill: a dark grassy dome; a fence; two people
  const hill = new THREE.Mesh(new THREE.SphereGeometry(60, 48, 24), new THREE.MeshStandardMaterial({ color: 0x1c2416, roughness: 1 }));
  hill.position.set(0, -58.6, 0);
  hill.receiveShadow = true;
  scene.add(hill);
  const fenceMat = new THREE.MeshStandardMaterial({ color: 0x241c14, roughness: 1 });
  for (let k = -6; k <= 6; k++) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.0, 0.08), fenceMat); p.position.set(k * 1.6, 0.5 - 0.0004 * (k * 1.6) ** 2, -6); scene.add(p); }
  const rail = new THREE.Mesh(new THREE.BoxGeometry(20, 0.06, 0.06), fenceMat); rail.position.set(0, 0.85, -6); scene.add(rail);
  const crowd = makeCrowd(scene, 2, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95 }));
  crowd.color(0, 0x2a3140, 0x1d2028, 0xe0ac86, 0x2e2018);
  crowd.color(1, 0x5a2f3a, 0x23242a, 0x9a6440, 0x151515);
  const hemi = new THREE.HemisphereLight(0x5a6a9a, 0x14160e, 1.6);
  scene.add(hemi);
  const streakLight = new THREE.DirectionalLight(0xffc090, 0);
  scene.add(streakLight, streakLight.target);

  const head = new THREE.Vector3(), tail = new THREE.Vector3();
  return {
    scene, camera,
    // k: 0..1 through the cutaway
    frame(v, k) {
      // the streak crosses the upper sky from the left, high, toward the right and down a little
      const a0 = 2.25, a1 = 0.6;                                   // azimuth (rad, from +x toward -z)
      const el0 = 0.8, el1 = 0.5;
      const kk = clamp(k * 1.15, 0, 1);
      const az = a0 + (a1 - a0) * kk, el = el0 + (el1 - el0) * kk;
      head.set(Math.cos(az) * Math.cos(el), Math.sin(el), -Math.sin(az) * Math.cos(el));
      const kt = Math.max(0, kk - 0.6);
      const azt = a0 + (a1 - a0) * kt, elt = el0 + (el1 - el0) * kt;
      tail.set(Math.cos(azt) * Math.cos(elt), Math.sin(elt), -Math.sin(azt) * Math.cos(elt));
      U.uHead.value.copy(head); U.uTail.value.copy(tail);
      U.uBright.value = smooth(0, 0.08, k) * (1.0 + 0.4 * Math.sin(v * 37) * Math.sin(v * 23));
      streakLight.position.copy(head).multiplyScalar(50);
      streakLight.intensity = 0.9 * U.uBright.value;
      // the two: one points up, both look up, turning a little to follow it
      const turn = -0.5 + 0.5 * kk;
      crowd.pose(0, { x: -0.55, y: 0.0, z: 0.4, yaw: Math.PI + turn - 0.2, look: 1.25, armR: 1.55, armL: 0.1 });
      crowd.pose(1, { x: 0.5, y: 0.0, z: 0.2, yaw: Math.PI + turn + 0.25, look: 1.15, armL: 0.0, armR: 0.0 });
      crowd.commit();
      camera.position.set(0.4, 0.8, 5.2);
      camera.lookAt(-0.5 + 0.8 * kk, 2.9, -3.0);
      camera.fov = 64;
      camera.updateProjectionMatrix();
      camera.updateMatrixWorld();
      sky.position.copy(camera.position);
    },
  };
}
