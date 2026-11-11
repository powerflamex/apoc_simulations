// The sky: a deep blue summer day with fair-weather clouds, all the way down the seabed (no haze, no murk).
// A dome that follows the camera, drawn first. Below the horizon it is the colour of deep sea.
import * as THREE from 'three';

export function makeSky() {
  const uniforms = { uTime: { value: 0 }, uSun: { value: new THREE.Vector3(0.3, 0.6, 0.7).normalize() }, uCloud: { value: 1 } };
  const mat = new THREE.ShaderMaterial({
    uniforms, side: THREE.BackSide, depthWrite: false, depthTest: false,
    vertexShader: /* glsl */ `varying vec3 vD; void main(){ vD = position; gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform float uTime; uniform vec3 uSun; uniform float uCloud;
      varying vec3 vD;
      float h12(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
      float n2(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(h12(i), h12(i + vec2(1, 0)), f.x), mix(h12(i + vec2(0, 1)), h12(i + vec2(1, 1)), f.x), f.y); }
      float fbm(vec2 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * n2(p); p = p * 2.03 + 1.7; a *= 0.5; } return s; }
      void main() {
        vec3 d = normalize(vD);
        float y = max(d.y, 0.0);
        float cs = max(dot(d, uSun), 0.0);
        vec3 zen = vec3(0.03, 0.17, 0.7), hor = vec3(0.36, 0.64, 0.98);
        vec3 c = mix(hor, zen, pow(smoothstep(0.0, 0.85, y), 0.5));
        c += vec3(1.0, 0.9, 0.7) * (0.06 * pow(cs, 8.0) + 0.3 * pow(cs, 200.0) + 3.0 * pow(cs, 3000.0));
        if (d.y > 0.015) {
          vec2 q = d.xz / (d.y + 0.1) * 1.5 + vec2(uTime * 0.02, uTime * 0.006);
          float f = fbm(q * 1.2);
          float cl = smoothstep(0.57, 0.7, f) * smoothstep(0.015, 0.16, d.y) * uCloud;
          float shade = 0.74 + 0.26 * smoothstep(0.5, 0.85, fbm(q * 1.2 + uSun.xz * 0.12));
          c = mix(c, vec3(1.0, 1.0, 1.03) * shade * 1.08, cl * 0.94);
        }
        c = mix(c, vec3(0.03, 0.2, 0.42), smoothstep(0.0, -0.03, d.y));
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), mat);
  mesh.renderOrder = -10;
  mesh.frustumCulled = false;
  return { mesh, uniforms };
}
