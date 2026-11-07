// The dusk sky (the Sun just set behind the far rim: a warm band low in the west, deep blue above, the first stars)
// and the plume: gas rising out of the pit and bending in the wind, its underside lit orange by the lake.
import * as THREE from 'three';
import { NOISE } from './glsl.js';

export function makeSky() {
  const U = { uGlow: { value: 1 }, uDim: { value: 1 } };
  const mat = new THREE.ShaderMaterial({
    uniforms: U, side: THREE.BackSide, depthWrite: false,
    vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }',
    fragmentShader: /* glsl */ `
      uniform float uGlow, uDim; varying vec3 vD;
      ${NOISE}
      void main() {
        vec3 d = normalize(vD);
        float e = d.y;
        vec3 c = mix(vec3(0.13, 0.11, 0.17), vec3(0.035, 0.06, 0.16), smoothstep(0.0, 0.35, e));
        c = mix(c, vec3(0.012, 0.022, 0.07), smoothstep(0.3, 0.95, e));
        // the afterglow in the west (-x)
        float w = max(dot(normalize(vec3(d.x, 0.0, d.z)), vec3(-0.8, 0.0, 0.6)), 0.0);
        c += vec3(0.75, 0.28, 0.1) * pow(w, 3.0) * exp(-max(e, 0.0) * 9.0) * 0.9;
        c += vec3(0.3, 0.12, 0.12) * pow(w, 1.5) * exp(-max(e, 0.0) * 4.0) * 0.3;
        // stars
        vec3 g = d * 260.0; vec3 id = floor(g);
        float st = h31(id); vec3 f = fract(g) - 0.5;
        c += vec3(0.9, 0.95, 1.0) * smoothstep(0.9965, 1.0, st) * smoothstep(0.18, 0.0, length(f)) * smoothstep(0.12, 0.45, e) * 1.6;
        // below the horizon: the dark land far off
        c = mix(c, vec3(0.012, 0.012, 0.016), smoothstep(0.005, -0.03, e));
        gl_FragColor = vec4(c * uDim, 1.0);
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(5000, 48, 24), mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;
  return { mesh, U };
}

export function makePlume() {
  const U = { uT: { value: 0 }, uGlow: { value: 1 }, uDense: { value: 1 }, uSky: { value: new THREE.Color(0.05, 0.06, 0.1) } };
  const geo = new THREE.CylinderGeometry(330, 105, 1300, 96, 60, true).translate(0, 650 + 300, 0);
  const mat = new THREE.ShaderMaterial({
    uniforms: U, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      varying vec3 vW; varying vec3 vL;
      void main() {
        vec3 p = position;
        float k = max(p.y - 380.0, 0.0);
        p.x += pow(k, 1.25) * 0.22;           // bent by the wind
        vL = position;
        vW = (modelMatrix * vec4(p, 1.0)).xyz;
        gl_Position = projectionMatrix * viewMatrix * vec4(vW, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform float uT, uGlow, uDense; uniform vec3 uSky;
      varying vec3 vW; varying vec3 vL;
      ${NOISE}
      void main() {
        float y = vL.y;
        vec3 q = vec3(vL.x * 0.006, (y - uT * 9.0) * 0.004, vL.z * 0.006);
        float n = vnoise(q * 2.0) * 0.55 + vnoise(q * 4.3 + 7.0) * 0.3 + vnoise(q * 9.1 - 3.0) * 0.15;
        float a = smoothstep(0.32, 0.78, n) * uDense;
        a *= smoothstep(400.0, 560.0, y) * (1.0 - smoothstep(900.0, 1550.0, y));
        // the rim of the cone is faint (no hard edge seen side on)
        vec3 V = normalize(cameraPosition - vW);
        vec3 nrm = normalize(vec3(vL.x, 0.0, vL.z));
        a *= 0.35 + 0.65 * smoothstep(0.0, 0.6, abs(dot(V, nrm)));
        vec3 glow = vec3(1.0, 0.22, 0.05) * exp(-(y - 380.0) / 220.0) * 0.55 * uGlow;
        vec3 c = glow * (0.6 + 0.6 * n) + uSky * 0.35;
        gl_FragColor = vec4(c, a * 0.42);
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 5;
  return { mesh, U };
}
