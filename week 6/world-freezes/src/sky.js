// The sky: a clear blue summer day with a few fair-weather clouds; then the cold. Diamond dust pales it; the liquid air
// condensing everywhere turns it to a white haze and then snow; and with almost no air left it goes black, the Sun a hard
// white disc, the stars out at noon. A dome that follows the camera, drawn first.
import * as THREE from 'three';

export function makeSky() {
  const uniforms = {
    uTime: { value: 0 }, uSun: { value: new THREE.Vector3(0.3, 0.6, 0.7).normalize() },
    uPale: { value: 0 }, uHaze: { value: 0 }, uDark: { value: 0 }, uCloud: { value: 1 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms, side: THREE.BackSide, depthWrite: false, depthTest: false,
    vertexShader: /* glsl */ `varying vec3 vD; void main(){ vD = position; gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform float uTime; uniform vec3 uSun; uniform float uPale; uniform float uHaze; uniform float uDark; uniform float uCloud;
      varying vec3 vD;
      float h12(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
      float n2(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(h12(i), h12(i + vec2(1, 0)), f.x), mix(h12(i + vec2(0, 1)), h12(i + vec2(1, 1)), f.x), f.y); }
      float fbm(vec2 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * n2(p); p = p * 2.03 + 1.7; a *= 0.5; } return s; }
      void main() {
        vec3 d = normalize(vD);
        float y = max(d.y, 0.0);
        float cs = max(dot(d, uSun), 0.0);
        // day
        vec3 zen = vec3(0.10, 0.30, 0.78), hor = vec3(0.62, 0.78, 0.95);
        vec3 c = mix(hor, zen, pow(smoothstep(0.0, 0.9, y), 0.55));
        c += vec3(1.0, 0.9, 0.7) * (0.06 * pow(cs, 8.0) + 0.25 * pow(cs, 200.0));
        // fair-weather clouds on a high layer
        if (d.y > 0.02) {
          vec2 q = d.xz / (d.y + 0.08) * 1.6 + vec2(uTime * 0.012, 0.0);
          float cl = smoothstep(0.52, 0.78, fbm(q * 1.3)) * smoothstep(0.02, 0.2, d.y) * uCloud;
          float shade = 0.82 + 0.18 * smoothstep(0.4, 0.9, fbm(q * 2.6 + 3.0));
          c = mix(c, vec3(1.0, 1.0, 1.02) * shade * 1.05, cl * 0.9);
        }
        // the cold: diamond dust pales it, the condensing air hazes it white
        c = mix(c, mix(vec3(0.72, 0.84, 0.96), vec3(0.86, 0.92, 0.99), y), uPale * 0.15);
        c = mix(c, mix(vec3(0.66, 0.73, 0.82), vec3(0.5, 0.58, 0.7), y), uHaze);
        // almost no air: black, stars, a bare Sun
        vec3 blk = vec3(0.004, 0.006, 0.014) + vec3(0.03, 0.05, 0.1) * exp(-y * 9.0) * (1.0 - smoothstep(0.6, 1.0, uDark));
        vec2 sp = vec2(atan(d.x, d.z), asin(clamp(d.y, -1.0, 1.0))) * 160.0;
        vec2 si = floor(sp);
        float st = step(0.985, h12(si)) * smoothstep(0.42, 0.0, length(fract(sp) - 0.5)) * (0.5 + 0.8 * h12(si + 3.0));
        blk += vec3(0.9, 0.95, 1.0) * st * 1.4 * smoothstep(0.03, 0.12, d.y);
        blk += vec3(3.0) * smoothstep(0.99955, 0.99975, cs) + vec3(0.25, 0.27, 0.3) * pow(cs, 300.0);
        c = mix(c, blk, uDark);
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
