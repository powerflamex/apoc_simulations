// The sky from wherever the camera is: blue hour over Miami (the afterglow low in the west-south-west, the pink
// band and Earth's shadow in the east, deep blue overhead), turning black with stars as you climb out of the air.
// A dome that follows the camera, drawn first.
import * as THREE from 'three';
import { SUN_DIR } from './earth.js';

export function makeSky() {
  const uniforms = {
    uSunDir: { value: SUN_DIR.clone() }, uAlt: { value: 0 }, uDip: { value: 0 }, uPx: { value: 0.001 }, uTime: { value: 0 },
    uFlash: { value: 0 }, uSmoke: { value: 0 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms, side: THREE.BackSide, depthWrite: false, depthTest: false,
    vertexShader: /* glsl */ `varying vec3 vD; void main(){ vD = position; gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uSunDir; uniform float uAlt; uniform float uDip; uniform float uPx; uniform float uTime; uniform float uFlash; uniform float uSmoke;
      varying vec3 vD;
      float hash13(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
      vec3 stars(vec3 d) {
        vec3 s = vec3(0.0);
        for (int k = 0; k < 2; k++) {
          float sc = k == 0 ? 220.0 : 520.0;
          vec3 p = d * sc;
          vec3 i = floor(p);
          float h = hash13(i + float(k) * 13.1);
          if (h > (k == 0 ? 0.93 : 0.965)) {
            vec3 c = i + 0.5 + (vec3(hash13(i + 1.3), hash13(i + 2.7), hash13(i + 4.1)) - 0.5) * 0.7;
            float dd = length(p - c) / sc;
            float sz = uPx * 0.9;
            float b = pow(hash13(i + 9.9), 6.0) * 4.0 + 0.35;
            vec3 tint = mix(vec3(1.0, 0.85, 0.7), vec3(0.75, 0.85, 1.0), hash13(i + 5.5));
            s += tint * b * exp(-dd * dd / (sz * sz));
          }
        }
        return s;
      }
      void main() {
        vec3 d = normalize(vD);
        float air = exp(-uAlt / 9000.0);               // how much air is above you
        vec3 sd = normalize(vec3(uSunDir.x, 0.0, uSunDir.z));
        float cs = dot(normalize(vec3(d.x, 0.0, d.z) + 1e-5), sd);
        float h = d.y + uDip;                             // height above the (dipping) horizon
        // blue hour from the ground
        vec3 zen = vec3(0.025, 0.06, 0.2);
        vec3 west = mix(vec3(0.95, 0.42, 0.2), vec3(0.55, 0.35, 0.5), smoothstep(0.0, 0.25, h));
        vec3 east = mix(vec3(0.16, 0.18, 0.32), vec3(0.42, 0.3, 0.42), smoothstep(0.02, 0.12, h) * (1.0 - smoothstep(0.12, 0.3, h)));
        vec3 low = mix(east, west, smoothstep(-0.6, 0.9, cs));
        low += vec3(1.3, 0.55, 0.2) * pow(max(cs, 0.0), 8.0) * exp(-max(h, 0.0) * 9.0) * 0.8;
        vec3 sky = mix(low, zen, smoothstep(0.0, 0.55, h));
        // climbing: the blue drains away overhead; a thin bright band stays on the horizon
        float limb = exp(-pow(max(h, 0.0) / (0.02 + 0.2 * air), 1.2));
        vec3 band = mix(vec3(0.2, 0.35, 0.8), vec3(1.0, 0.45, 0.18), smoothstep(-0.3, 0.9, cs)) * 0.9;
        sky = mix(band * limb, sky, air);
        sky = mix(sky, vec3(0.0), (1.0 - air) * smoothstep(0.02, 0.4, h) * 0.0);
        // stars once the sky is dark enough
        float dark = 1.0 - smoothstep(0.05, 0.3, dot(sky, vec3(0.33)));
        sky += stars(d) * dark * smoothstep(-0.02, 0.05, h) * (1.0 - uSmoke);
        // smoke from the burning city hangs over it (late)
        sky = mix(sky, vec3(0.12, 0.08, 0.07) * (0.6 + 0.4 * h), uSmoke * air * smoothstep(-0.05, 0.4, h) * 0.6);
        sky += vec3(1.0, 0.85, 0.65) * uFlash * air;
        gl_FragColor = vec4(sky, 1.0);
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1000, 64, 32), mat);
  mesh.renderOrder = -10;
  mesh.frustumCulled = false;
  return { mesh, uniforms };
}
