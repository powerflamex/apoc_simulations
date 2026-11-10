// The traffic: cars in four lanes (toward you on the left, away on the right), evenly spaced per lane so they never
// overlap, wrapping far down the boulevard and behind you. In the time-lapse they drop out one by one and the lanes
// turn into rivers of light (a long exposure: white headlights coming, red tail lights going). When the ground starts
// to shake the traffic stops; then the cars float up off their piece of the street.
import * as THREE from 'three';
import { makeFleet } from './cars.js';
import { CARS, TRAFFIC, LANES } from './layout.js';
import { SEC } from './timeline.js';
import { nearestSeed } from './split.js';
import { rng, smooth } from './util.js';

const PAL = [0xb8bcc2, 0x1f2328, 0xf2f2f0, 0x8c1d1d, 0x24406b, 0x55595e, 0xd9c9a3, 0x2f4f3a, 0x6d1f4f, 0xf2f2f0, 0x1f2328, 0x9aa3ad];
const HIDE = new THREE.Matrix4().makeScale(0, 0, 0);
const dummy = new THREE.Object3D(), m4 = new THREE.Matrix4(), V = new THREE.Vector3();
// distance driven: the traffic stops when the ground starts to shake
const stopAt = SEC.split + 1, stopLen = 5;
const G = (x) => (x >= 1 ? 0.5 : x - x * x * x + 0.5 * x * x * x * x);
const driveClock = (v) => (v < stopAt ? v : stopAt + stopLen * G((v - stopAt) / stopLen));

export function makeTraffic(scene, ctx) {
  const fleet = makeFleet(scene, CARS.length, ctx);
  const R = rng(909);
  CARS.forEach((c, i) => {
    fleet.color(i, c.taxi ? 0xe3b21a : PAL[Math.floor(R() * PAL.length)], c.kind);
    c.out = SEC.lapse + 0.3 + R() * 4.5;
    c.back = SEC.planets - 3 + R() * 5;
  });
  const span = TRAFFIC.Z0 - TRAFFIC.Z1;

  // ---- the light trails: two strips per lane (the pair of lights), a moving pattern of brighter and dimmer stretches ----
  const geo = new THREE.PlaneGeometry(1, 1, 1, 1);
  const trailMat = new THREE.ShaderMaterial({
    uniforms: { uK: { value: 0 }, uTime: { value: 0 } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    vertexShader: /* glsl */ `varying vec2 vUv; varying vec3 vW; void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */ `uniform float uK; uniform float uTime; varying vec2 vUv; varying vec3 vW;
      float h(float x){ return fract(sin(x * 127.1) * 43758.5453); }
      float n1(float x){ float i = floor(x), f = fract(x); f = f*f*(3.0-2.0*f); return mix(h(i), h(i + 1.0), f); }
      void main(){
        bool coming = vW.x < 0.0;
        float y = abs(vUv.y - 0.5) * 2.0;
        float core = exp(-y * y * 9.0);
        float z = vW.z;
        float flow = 0.55 + 0.45 * n1(z * 0.03 + (coming ? -1.0 : 1.0) * uTime * 0.4) * n1(z * 0.11 + 7.0);
        vec3 c = coming ? vec3(1.0, 0.86, 0.62) * 2.6 : vec3(2.4, 0.18, 0.08);
        float fade = smoothstep(${TRAFFIC.Z1.toFixed(1)}, ${(TRAFFIC.Z1 + 200).toFixed(1)}, z) * smoothstep(${TRAFFIC.Z0.toFixed(1)}, ${(TRAFFIC.Z0 - 30).toFixed(1)}, z);
        gl_FragColor = vec4(c * core * flow * uK * fade, 1.0);
      }`,
  });
  const trails = [];
  for (const x of LANES) for (const s of [-0.72, 0.72]) {
    const m = new THREE.Mesh(geo, trailMat);
    const coming = x < 0;
    m.position.set(x + s, coming ? 0.66 : 0.76, (TRAFFIC.Z0 + TRAFFIC.Z1) / 2);
    m.rotation.y = Math.PI / 2;
    m.scale.set(span, 0.32, 1);
    m.frustumCulled = false; m.renderOrder = 7;
    scene.add(m); trails.push(m);
  }

  return {
    fleet, trailMat,
    frame(v, s, glows, M) {
      const d = driveClock(v);
      trailMat.uniforms.uK.value = smooth(SEC.lapse + 0.5, SEC.lapse + 5, v) * (1 - smooth(SEC.planets - 3, SEC.planets + 1, v));
      trailMat.uniforms.uTime.value = v;
      for (const t of trails) t.visible = trailMat.uniforms.uK.value > 0.001;
      CARS.forEach((c, i) => {
        if (v > c.out && v < c.back) { fleet.set(i, HIDE, false); return; }
        const w = (((c.z0 + d * c.speed) % span) + span) % span;
        const z = c.dir > 0 ? TRAFFIC.Z1 + w : TRAFFIC.Z0 - w;
        dummy.position.set(c.x, 0, z);
        dummy.rotation.set(0, c.dir > 0 ? Math.PI : 0, 0);
        dummy.scale.setScalar(1);
        // floating once the ground goes
        if (s.lift > 0) {
          const t = Math.max(0, v - (SEC.splitHush - 2 + c.seed * 5));
          dummy.position.y = 0.035 * t * t * (0.5 + c.seed) * s.lift;
          dummy.rotation.x = s.lift * 0.4 * Math.sin(t * 0.25 + c.seed * 9) * Math.min(1, t * 0.15);
          dummy.rotation.z = s.lift * 0.5 * Math.sin(t * 0.2 + c.seed * 5) * Math.min(1, t * 0.15);
        }
        dummy.updateMatrix();
        let mm = dummy.matrix;
        if (M) mm = m4.multiplyMatrices(M[nearestSeed(c.x, z)], dummy.matrix);
        fleet.set(i, mm, s.grid > 0.3);
        // headlights seen from the front throw a glow (the coming lanes, near the camera)
        if (c.dir > 0 && z > -260 && z < 30 && s.grid > 0.3 && s.dark > 0.5) {
          for (const sx of [-0.62, 0.62]) {
            V.set(sx, 0.7, -2.35).applyMatrix4(mm);
            glows.add(V.x, V.y, V.z, 0.9, 3.0, 2.7, 2.2);
          }
        } else if (c.dir < 0 && z > -260 && z < 30 && s.grid > 0.3 && s.dark > 0.5) {
          for (const sx of [-0.65, 0.65]) {
            V.set(sx, 0.74, 2.35).applyMatrix4(mm);
            glows.add(V.x, V.y, V.z, 0.55, 1.6, 0.08, 0.04);
          }
        }
      });
      fleet.commit();
    },
  };
}
