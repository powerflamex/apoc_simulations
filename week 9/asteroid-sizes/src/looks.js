// Light and air shared by the far things drawn with their own shaders (the land, the bay, the city, the trees): the
// Sun behind you, the sky's light, the light of whatever is burning in front of you, the haze, and the blast's mark on
// the ground (where its front has got to, the crater, the molten crust). main.js sets these every frame to match the
// lights the near things (the terrace, the people) get from three.js.
import * as THREE from 'three';

export const LU = {
  uTime: { value: 0 },
  uSunDir: { value: new THREE.Vector3(0.3, 0.5, 0.8).normalize() }, uSunC: { value: new THREE.Color(3, 2.8, 2.5) },
  uSkyC: { value: new THREE.Color(0.5, 0.62, 0.85) }, uGndC: { value: new THREE.Color(0.35, 0.33, 0.3) },
  uFrontDir: { value: new THREE.Vector3(0, 0.2, -1).normalize() }, uFrontC: { value: new THREE.Color(0, 0, 0) },
  uHazeC: { value: new THREE.Color(0.62, 0.72, 0.86) }, uHazeD: { value: 26000 },
  uSkyHi: { value: new THREE.Color(0.07, 0.22, 0.62) }, uSkyLo: { value: new THREE.Color(0.56, 0.7, 0.88) },
  // the blast on the ground: front radius (m from ground zero), its kind, the crater, the molten ground
  uGZ: { value: new THREE.Vector2(-60, -2400) }, uFront: { value: 1e9 }, uKind: { value: 0 },
  uCrater: { value: 0 }, uMelt: { value: 0 }, uScorch: { value: 0 }, uBoil: { value: 0 }, uDustC: { value: new THREE.Color(0.55, 0.47, 0.4) },
  uTide: { value: 0 },
};

export const LIGHT_GLSL = /* glsl */ `
uniform float uTime;
uniform vec3 uSunDir; uniform vec3 uSunC; uniform vec3 uSkyC; uniform vec3 uGndC; uniform vec3 uFrontDir; uniform vec3 uFrontC;
uniform vec3 uHazeC; uniform float uHazeD; uniform vec3 uSkyHi; uniform vec3 uSkyLo;
uniform vec2 uGZ; uniform float uFront; uniform float uKind; uniform float uCrater; uniform float uMelt; uniform float uScorch;
uniform float uBoil; uniform vec3 uDustC; uniform float uTide;
float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float n21(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
float f21(vec2 p){ return n21(p) * 0.5 + n21(p * 2.1 + 3.1) * 0.3 + n21(p * 4.3 + 7.7) * 0.2; }
vec3 lit(vec3 alb, vec3 N, float ao) {
  float sun = max(dot(N, uSunDir), 0.0);
  float fr = max(dot(N, uFrontDir), 0.0);
  vec3 amb = mix(uGndC, uSkyC, 0.5 + 0.5 * N.y) * ao;
  return alb * (uSunC * sun + amb + uFrontC * fr);
}
vec3 haze(vec3 c, float d, float y) {
  float k = 1.0 - exp(-d / uHazeD);
  // (thinner up high: the far hills' tops are clearer than their feet)
  k *= mix(1.0, 0.7, clamp(y / 600.0, 0.0, 1.0));
  return mix(c, uHazeC, k);
}
vec3 skyRefl(vec3 r) {
  float h = clamp(r.y, 0.0, 1.0);
  return mix(uSkyLo, uSkyHi, pow(smoothstep(0.0, 0.7, h), 0.55));
}
// the molten crust and the fire behind a blast front (gz: distance from ground zero)
vec3 melt(vec3 c, float gz, vec2 xz) {
  if (uMelt <= 0.0) return c;
  float inside = 1.0 - smoothstep(uMelt - 60.0, uMelt, gz);
  if (inside <= 0.0) return c;
  float cr = f21(xz * 0.012 + 3.0), cr2 = abs(n21(xz * 0.03) - 0.5) * 2.0;
  vec3 lava = mix(vec3(0.08, 0.03, 0.02), vec3(3.2, 0.9, 0.12), smoothstep(0.35, 0.75, cr) * 0.7 + (1.0 - smoothstep(0.0, 0.12, cr2)) * 0.8);
  return mix(c, lava, inside);
}
`;
