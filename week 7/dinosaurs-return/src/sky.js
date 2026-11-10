// The sky: a clear blue summer day with a few fair-weather clouds drifting. A dome that follows the camera, drawn first.
import * as THREE from 'three';

export function makeSky() {
  const uniforms = { uTime: { value: 0 }, uSun: { value: new THREE.Vector3(0.3, 0.6, 0.7).normalize() } };
  const mat = new THREE.ShaderMaterial({
    uniforms, side: THREE.BackSide, depthWrite: false, depthTest: false,
    vertexShader: /* glsl */ `varying vec3 vD; void main(){ vD = position; gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform float uTime; uniform vec3 uSun;
      varying vec3 vD;
      float h12(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
      float n2(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(h12(i), h12(i + vec2(1, 0)), f.x), mix(h12(i + vec2(0, 1)), h12(i + vec2(1, 1)), f.x), f.y); }
      float fbm(vec2 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * n2(p); p = p * 2.03 + 1.7; a *= 0.5; } return s; }
      void main() {
        vec3 d = normalize(vD);
        float y = max(d.y, 0.0);
        float cs = max(dot(d, uSun), 0.0);
        vec3 zen = vec3(0.09, 0.28, 0.76), hor = vec3(0.6, 0.76, 0.94);
        vec3 c = mix(hor, zen, pow(smoothstep(0.0, 0.9, y), 0.55));
        c += vec3(1.0, 0.9, 0.7) * (0.06 * pow(cs, 8.0) + 0.25 * pow(cs, 200.0));
        if (d.y > 0.02) {
          vec2 q = d.xz / (d.y + 0.08) * 1.6 + vec2(uTime * 0.012, 0.0);
          float cl = smoothstep(0.54, 0.8, fbm(q * 1.3)) * smoothstep(0.02, 0.2, d.y);
          float shade = 0.82 + 0.18 * smoothstep(0.4, 0.9, fbm(q * 2.6 + 3.0));
          c = mix(c, vec3(1.0, 1.0, 1.02) * shade * 1.05, cl * 0.9);
        }
        c = mix(c, vec3(0.5, 0.52, 0.55), smoothstep(0.0, -0.2, d.y));
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
