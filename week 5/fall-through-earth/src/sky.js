// The sky over each end of the hole: Madrid in the early afternoon (deep blue, a high Sun, a few soft clouds)
// and Wellington in the middle of the night (dark blue, stars, cloud lit orange from below by the city).
import * as THREE from 'three';

export function makeSky() {
  const U = {
    uNight: { value: 0 },
    uSun: { value: new THREE.Vector3(0.35, 0.82, -0.45).normalize() },
    uTime: { value: 0 },
    uGain: { value: 1 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms: U,
    side: THREE.BackSide,
    depthWrite: false,
    vertexShader: /* glsl */ `
      varying vec3 vD;
      void main() { vD = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }`,
    fragmentShader: /* glsl */ `
      uniform float uNight, uTime, uGain; uniform vec3 uSun;
      varying vec3 vD;
      float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
      float n2(vec2 p) { vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(h21(i), h21(i + vec2(1, 0)), u.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), u.x), u.y); }
      float fbm(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { s += a * n2(p); p = p * 2.03 + 7.1; a *= 0.5; } return s; }
      void main() {
        vec3 d = normalize(vD);
        float h = clamp(d.y, -1.0, 1.0);
        // day: deep blue overhead, paler to the horizon, a bright Sun with a halo
        vec3 day = mix(vec3(0.62, 0.76, 0.92), vec3(0.16, 0.38, 0.78), pow(max(h, 0.0), 0.6));
        float sd = max(dot(d, uSun), 0.0);
        day += vec3(1.0, 0.95, 0.85) * (pow(sd, 900.0) * 30.0 + pow(sd, 40.0) * 0.35 + pow(sd, 6.0) * 0.12);
        vec2 cp = d.xz / max(d.y, 0.08) * 1.4 + vec2(uTime * 0.01, 0.0);
        float cl = smoothstep(0.52, 0.78, fbm(cp));
        day = mix(day, vec3(0.97, 0.98, 1.0) * (0.9 + 0.2 * sd), cl * 0.85 * smoothstep(0.02, 0.2, h));
        // night: navy with the city's orange glow low down and on the clouds, stars above
        vec3 night = mix(vec3(0.16, 0.1, 0.07), vec3(0.015, 0.025, 0.06), smoothstep(0.0, 0.5, h));
        float ncl = smoothstep(0.45, 0.8, fbm(cp * 0.8 + 3.0));
        night = mix(night, vec3(0.22, 0.13, 0.08) * (1.0 - 0.6 * smoothstep(0.1, 0.8, h)), ncl * 0.8);
        vec2 sg = d.xz / (1.0 + d.y) * 260.0;
        float st = step(0.9965, h21(floor(sg))) * smoothstep(0.1, 0.4, h) * (1.0 - ncl);
        night += vec3(0.8, 0.85, 1.0) * st * 1.2;
        vec3 c = mix(day, night, uNight) * uGain;
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(5000, 48, 24), mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;
  return { mesh, U };
}
