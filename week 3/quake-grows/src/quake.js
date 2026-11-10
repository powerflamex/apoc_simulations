// How the ground moves, one function used everywhere (GLSL for every material, the same in JS for the camera and
// the glows):
//   the jolting: everything on the ground shifts back and forth together, fast (uShake, m)
//   the rolling: from magnitude ~8 the surface carries waves you can see, rolling up the hill toward you
//   (uRoll: their height, m; ~90 m and ~55 m long, coming up California St from the Bay)
//   the rift: at magnitude 10 the street splits along a line just right of the cable car tracks; the right side
//   drops and slides, a gap opens between (uSplit 0..1)
// Things on the ground move rigidly with the point they stand on (cars, people: their instance's origin); the
// ground and the buildings bend with it (buildings also sway, more toward the top, each at its own period).
import * as THREE from 'three';

export const QU = { uTime: { value: 0 }, uShake: { value: 0 }, uRoll: { value: 0 }, uSplit: { value: 0 } };
export const RIFT = { z0: -60, z1: -760, gap: 7, drop: 5, slide: 2.5 };
export const riftX = (z) => 5.6 + 1.6 * Math.sin(z * 0.021) + 0.8 * Math.sin(z * 0.067 + 1);

export const QUAKE_GLSL = /* glsl */ `
uniform float uTime; uniform float uShake; uniform float uRoll; uniform float uSplit;
float riftX(float z) { return 5.6 + 1.6 * sin(z * 0.021) + 0.8 * sin(z * 0.067 + 1.0); }
// displacement at world point p (rigid things pass their origin as p)
vec3 quakeD(vec3 p) {
  float t = uTime;
  vec3 d = vec3(0.0);
  // jolting: the whole ground together, a few Hz, in all three directions
  d.x += uShake * (0.55 * sin(t * 13.1) + 0.3 * sin(t * 21.7 + 1.3) + 0.15 * sin(t * 33.0 + 2.0));
  d.z += uShake * (0.5 * sin(t * 11.3 + 0.7) + 0.35 * sin(t * 19.1 + 2.2) + 0.15 * sin(t * 29.0));
  d.y += uShake * 0.4 * (0.6 * sin(t * 15.7 + 0.4) + 0.4 * sin(t * 25.3 + 1.1));
  // rolling waves, travelling up the hill (+z) at ~30 m/s; the ground moves in ellipses (up and back)
  float a1 = 6.2832 / 90.0 * (p.z + 0.12 * p.x) - t * 2.1;
  float a2 = 6.2832 / 55.0 * (p.z - 0.25 * p.x) - t * 3.3 + 1.7;
  float a3 = 6.2832 / 140.0 * (p.x * 0.8 + p.z * 0.6) - t * 1.4 + 0.6;
  d.y += uRoll * (0.55 * sin(a1) + 0.3 * sin(a2) + 0.25 * sin(a3));
  d.z += uRoll * 0.45 * (0.55 * cos(a1) + 0.3 * cos(a2));
  d.x += uRoll * 0.3 * cos(a3);
  // the rift: everything right of the line (x > riftX) drops and slides downhill
  if (uSplit > 0.0) {
    float inZ = smoothstep(${RIFT.z0.toFixed(1)}, ${(RIFT.z0 - 40).toFixed(1)}, p.z) * smoothstep(${RIFT.z1.toFixed(1)}, ${(RIFT.z1 + 60).toFixed(1)}, p.z);
    float side = smoothstep(-0.25, 0.25, p.x - riftX(p.z));
    d.y -= ${RIFT.drop.toFixed(1)} * uSplit * side * inZ;
    d.z -= ${RIFT.slide.toFixed(1)} * uSplit * side * inZ;
    d.x += ${(RIFT.gap / 2).toFixed(1)} * uSplit * (side * 2.0 - 1.0) * inZ;
  }
  return d;
}
`;

export function quakeD(x, y, z, u = QU) {
  const t = u.uTime.value, S = u.uShake.value, Rl = u.uRoll.value, Sp = u.uSplit.value;
  const d = { x: 0, y: 0, z: 0 };
  d.x += S * (0.55 * Math.sin(t * 13.1) + 0.3 * Math.sin(t * 21.7 + 1.3) + 0.15 * Math.sin(t * 33.0 + 2.0));
  d.z += S * (0.5 * Math.sin(t * 11.3 + 0.7) + 0.35 * Math.sin(t * 19.1 + 2.2) + 0.15 * Math.sin(t * 29.0));
  d.y += S * 0.4 * (0.6 * Math.sin(t * 15.7 + 0.4) + 0.4 * Math.sin(t * 25.3 + 1.1));
  const a1 = 6.2832 / 90 * (z + 0.12 * x) - t * 2.1, a2 = 6.2832 / 55 * (z - 0.25 * x) - t * 3.3 + 1.7, a3 = 6.2832 / 140 * (x * 0.8 + z * 0.6) - t * 1.4 + 0.6;
  d.y += Rl * (0.55 * Math.sin(a1) + 0.3 * Math.sin(a2) + 0.25 * Math.sin(a3));
  d.z += Rl * 0.45 * (0.55 * Math.cos(a1) + 0.3 * Math.cos(a2));
  d.x += Rl * 0.3 * Math.cos(a3);
  if (Sp > 0) {
    const ss = (a, b, x2) => { const k = Math.min(1, Math.max(0, (x2 - a) / (b - a))); return k * k * (3 - 2 * k); };
    const inZ = ss(RIFT.z0, RIFT.z0 - 40, z) * ss(RIFT.z1, RIFT.z1 + 60, z);
    const side = ss(-0.25, 0.25, x - riftX(z));
    d.y -= RIFT.drop * Sp * side * inZ; d.z -= RIFT.slide * Sp * side * inZ; d.x += RIFT.gap / 2 * Sp * (side * 2 - 1) * inZ;
  }
  return d;
}

// replace the vertex projection: world position, displaced, then the camera
// opts.rigid: displace by the instance's origin (cars, people, props); opts.sway: buildings (aS.w = height, aS.x = seed)
export function quakeShader(shader, { rigid = false, sway = false } = {}) {
  Object.assign(shader.uniforms, QU);
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\n' + QUAKE_GLSL + (sway && !shader.vertexShader.includes('attribute vec4 aS;') ? 'attribute vec4 aS;\n' : ''))
    .replace('#include <project_vertex>', `
      vec4 qw = vec4(transformed, 1.0);
      #ifdef USE_INSTANCING
        qw = instanceMatrix * qw;
      #endif
      qw = modelMatrix * qw;
      vec3 qo = qw.xyz;
      ${rigid ? `
      #ifdef USE_INSTANCING
        qo = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
      #else
        qo = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
      #endif` : ''}
      ${sway ? `
      vec3 qb = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
      qo = vec3(qb.x, qb.y, qb.z);
      ` : ''}
      qw.xyz += quakeD(qo);
      ${sway ? `
      {
        // sway: the top lags behind the ground, swinging at the building's own period (taller = slower)
        float hgt = max(aS.w, 3.0);
        float k = pow(clamp((qw.y - qb.y) / hgt, 0.0, 1.0), 1.5);
        float Tn = 0.1 * hgt / 3.8 + 0.25;
        float ph = aS.x * 40.0;
        float amp = (uShake * 2.5 + uRoll * 0.35) * min(hgt / 20.0, 6.0);
        qw.x += amp * k * sin(uTime * 6.2832 / Tn + ph);
        qw.z += amp * k * 0.7 * sin(uTime * 6.2832 / Tn * 1.13 + ph * 1.7);
      }` : ''}
      vec4 mvPosition = viewMatrix * qw;
      gl_Position = projectionMatrix * mvPosition;`);
}
export function quakeMat(m, opts = {}) {
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (sh, r) => { if (prev) prev(sh, r); quakeShader(sh, opts); };
  const key = m.customProgramCacheKey ? m.customProgramCacheKey() : '';
  m.customProgramCacheKey = () => key + '|quake' + (opts.rigid ? 'R' : '') + (opts.sway ? 'S' : '');
  return m;
}
// a depth material for shadows that moves the same way
export function quakeDepth(opts = {}) {
  return quakeMat(new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking }), opts);
}
