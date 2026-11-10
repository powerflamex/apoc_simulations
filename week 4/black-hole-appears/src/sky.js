// The night sky over Las Vegas from wherever the camera is: deep blue-violet overhead, the orange-pink glow of the
// city low down (it fades as the lights go out), a few stars; draining to black with the Milky Way as the camera
// climbs out of the air. A dome that follows the camera, drawn first.
import * as THREE from 'three';

export function makeSky() {
  const uniforms = {
    uDip: { value: 0 }, uPx: { value: 0.001 }, uSpace: { value: 0 }, uGlow: { value: 1 }, uTilt: { value: 0 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms, side: THREE.BackSide, depthWrite: false, depthTest: false,
    vertexShader: /* glsl */ `varying vec3 vD; void main(){ vD = position; gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform float uDip; uniform float uPx; uniform float uSpace; uniform float uGlow;
      varying vec3 vD;
      float hash13(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
      vec3 stars(vec3 d, float amt) {
        vec3 s = vec3(0.0);
        for (int k = 0; k < 3; k++) {
          float sc = k == 0 ? 150.0 : k == 1 ? 360.0 : 760.0;
          vec3 p = d * sc;
          vec3 i = floor(p);
          float h = hash13(i + float(k) * 13.1);
          if (h > (k == 0 ? 0.955 : 0.95)) {
            vec3 c = i + 0.5 + (vec3(hash13(i + 1.3), hash13(i + 2.7), hash13(i + 4.1)) - 0.5) * 0.7;
            float dd = length(p - c) / sc;
            float sz = uPx * 0.85;
            float b = pow(hash13(i + 9.9), 5.0) * 5.0 + 0.25;
            vec3 tint = mix(vec3(1.0, 0.82, 0.65), vec3(0.72, 0.84, 1.0), hash13(i + 5.5));
            s += tint * b * exp(-dd * dd / (sz * sz)) * (k == 2 ? amt : 1.0);
          }
        }
        vec3 ax = normalize(vec3(0.35, 0.55, -0.76));
        float band = exp(-pow(dot(d, ax) / 0.16, 2.0));
        float m = hash13(floor(d * 90.0)) * 0.5 + hash13(floor(d * 33.0)) * 0.5;
        s += vec3(0.5, 0.45, 0.4) * band * (0.02 + 0.03 * m) * amt;
        return s;
      }
      void main() {
        vec3 d = normalize(vD);
        float h = d.y + uDip;                     // height above the (dipping) horizon
        // in the air: the city's glow low down, violet-blue above
        vec3 top = vec3(0.012, 0.016, 0.045);
        vec3 mid = vec3(0.06, 0.04, 0.09);
        vec3 low = vec3(0.42, 0.2, 0.14) * uGlow + vec3(0.06, 0.04, 0.06);
        vec3 c = mix(low, mid, smoothstep(0.0, 0.12, h));
        c = mix(c, top, smoothstep(0.08, 0.6, h));
        c += stars(d, 0.25) * smoothstep(0.05, 0.3, h) * 0.5;
        // below the horizon (from high up): the dark ground's haze
        c = mix(c, vec3(0.03, 0.025, 0.03), smoothstep(0.0, -0.05, h));
        // space
        vec3 sp = stars(d, 1.0);
        c = mix(c, sp, uSpace);
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 32), mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;
  return { mesh, uniforms };
}
