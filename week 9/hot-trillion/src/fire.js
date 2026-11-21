// Flames: camera-facing (about the vertical) quads with a flickering flame drawn in the shader, added onto the frame.
// Callers fill the list each frame: fire.begin(); fire.add(x, y, z, width, height, intensity, seed); fire.end().
// The flame's base sits at y; it licks upward, its tongues scrolling up, deep red at the edges, yellow at the core.
import * as THREE from 'three';
import { logQ } from './timeline.js';
import { HEART } from './layout.js';
import { LQ } from './heat.js';

export function makeFire(scene, max = 3000) {
  const geo = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0);
  const aB = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4);   // base xyz, width
  const aF = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3);   // height, intensity, seed
  geo.setAttribute('aB', aB); geo.setAttribute('aF', aF);
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      attribute vec4 aB; attribute vec3 aF; varying vec2 vUv; varying vec3 vF; varying float vNear;
      void main() {
        vUv = vec2(position.x * 2.0, position.y); vF = aF;
        vec3 toC = cameraPosition - aB.xyz; toC.y = 0.0;
        vec3 side = normalize(cross(vec3(0.0, 1.0, 0.0), normalize(toC + vec3(1e-4, 0.0, 0.0))));
        vec3 w = aB.xyz + side * position.x * aB.w + vec3(0.0, position.y * aF.x, 0.0);
        // (a flame right at the lens would be a big orange smear: fade it)
        vNear = smoothstep(0.6, 2.0, length(cameraPosition - aB.xyz) / max(aB.w, 0.1));
        gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime; varying vec2 vUv; varying vec3 vF; varying float vNear;
      float h(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
      float n2(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
      void main() {
        float s = vF.z * 37.0;
        vec2 q = vec2(vUv.x * 1.6, vUv.y * 2.2 - uTime * (2.4 + vF.z));
        float n = n2(q + s) * 0.55 + n2(q * 2.3 + s * 1.7) * 0.3 + n2(q * 5.1 - s) * 0.15;
        // a teardrop: wide at the base, a tip that whips about
        float y = vUv.y;
        float wid = (1.0 - y) * 0.95 * smoothstep(0.0, 0.18, y) + 0.08;
        float x = vUv.x + (n2(vec2(y * 3.0 - uTime * 2.0, s)) - 0.5) * 0.5 * y;
        float d = wid - abs(x) + (n - 0.5) * 0.75 - y * 0.25;
        float a = smoothstep(0.0, 0.12, d);
        if (a <= 0.003) discard;
        float core = smoothstep(0.2, 0.6, d);
        vec3 c = mix(vec3(0.45, 0.04, 0.0), vec3(1.25, 0.42, 0.06), smoothstep(0.0, 0.45, d)) + vec3(0.45, 0.4, 0.2) * core;
        gl_FragColor = vec4(c * a * vF.y * vNear, 1.0);
      }`,
  });
  const mesh = new THREE.InstancedMesh(geo, mat, max);
  mesh.frustumCulled = false; mesh.renderOrder = 6;
  scene.add(mesh);
  let n = 0, L = 0;
  return {
    mat,
    begin(Lnow) { n = 0; L = Lnow; },
    add(x, y, z, w, hgt, k, seed) {
      // once a thing is hot enough to glow white on its own, it's past burning: the flames die back into the glare
      const lq = logQ(L, Math.hypot(x - HEART.x, y + hgt * 0.3 - HEART.y, z - HEART.z));
      k *= 1 - Math.min(1, Math.max(0, (lq - LQ.GLASS - 0.1) / 0.6));
      if (n >= max || k < 0.01 || w <= 0 || hgt <= 0) return;
      aB.setXYZW(n, x, y, z, w); aF.setXYZ(n, hgt, k, seed); n++;
    },
    end() { mesh.count = n; aB.needsUpdate = true; aF.needsUpdate = true; },
  };
}
