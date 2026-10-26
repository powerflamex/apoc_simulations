// The sky over the plaza: a summer afternoon with a thunderstorm coming in from the north (-z). The Sun is behind
// you (south-west), so the towers ahead stand sunlit against dark storm clouds. The lightning lights the clouds
// around the bolt (uFlash, uBoltDir); the storm thickens over the Sun as the rain arrives (uStorm).
import * as THREE from 'three';

export function makeSky() {
  const uniforms = {
    uSunDir: { value: new THREE.Vector3(0.3, 0.5, 0.8).normalize() },
    uSunCol: { value: new THREE.Color(1, 0.92, 0.8) },
    uStorm: { value: 0 },
    uFlash: { value: 0 },
    uGlow: { value: 0 },
    uBoltDir: { value: new THREE.Vector3(0, 0.3, -1).normalize() },
    uDrift: { value: new THREE.Vector2(0, 0) },
    uDim: { value: 0 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position = p.xyww;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uSunDir; uniform vec3 uSunCol; uniform float uStorm; uniform float uFlash; uniform float uGlow;
      uniform vec3 uBoltDir; uniform vec2 uDrift; uniform float uDim;
      varying vec3 vDir;
      float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
      float vn(vec2 p) {
        vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y);
      }
      float fbm(vec2 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 6; i++) { s += a * vn(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; } return s; }
      void main() {
        vec3 d = normalize(vDir);
        float e = max(d.y, 0.0);
        // clear sky: deep blue overhead, hazy pale blue at the horizon
        vec3 zen = vec3(0.16, 0.34, 0.72), hor = vec3(0.62, 0.72, 0.84);
        vec3 col = mix(hor, zen, pow(e, 0.55));
        float sd = max(dot(d, uSunDir), 0.0);
        col += uSunCol * (pow(sd, 8.0) * 0.25 + pow(sd, 60.0) * 0.6);
        // the storm: a heavy deck to the north, thinning toward the Sun; billowing undersides
        vec2 uv = d.xz / (d.y + 0.08) * 0.9 + uDrift;
        float n = fbm(uv * 0.55), n2 = fbm(uv * 1.6 + 4.0);
        float north = smoothstep(0.55, -0.85, d.z);                 // 1 toward -z
        float cover = clamp(north * 1.15 + uStorm * 0.9 - 0.25, 0.0, 1.0);
        float c = smoothstep(0.62 - 0.55 * cover, 0.9 - 0.4 * cover, n + 0.25 * n2);
        c *= smoothstep(-0.02, 0.06, d.y) * 0.85 + 0.15;
        // cloud colour: dark slate inside, sunlit rims where the Sun catches the edges
        float rim = smoothstep(0.35, 0.0, abs(n + 0.25 * n2 - 0.75 + 0.4 * cover)) * (0.4 + 0.6 * pow(sd, 2.0));
        vec3 cl = mix(vec3(0.13, 0.15, 0.2), vec3(0.05, 0.06, 0.09), cover * smoothstep(0.45, 1.0, n + n2 * 0.4));
        cl += uSunCol * rim * 0.55 * (1.0 - 0.6 * uStorm);
        // low on the horizon under the storm: a dark band of rain
        cl = mix(cl, vec3(0.2, 0.23, 0.28), smoothstep(0.12, 0.0, d.y) * north * 0.6);
        col = mix(col, cl, c);
        // the storm darkens the whole sky once it's overhead
        col *= 1.0 - 0.62 * uDim;
        // lightning: the clouds around the bolt light up from inside
        float bd = max(dot(d, uBoltDir), 0.0);
        float lit = pow(bd, 5.0) * 0.45 + 0.04;
        col += vec3(0.75, 0.8, 1.0) * (uFlash * lit * (0.4 + 0.9 * c) * 0.9 + uGlow * pow(bd, 4.0) * 0.12);
        if (d.y < 0.0) col = mix(col, vec3(0.22, 0.24, 0.27), smoothstep(0.0, -0.05, d.y));
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(5000, 48, 24), mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;
  return { mesh, uniforms };
}
