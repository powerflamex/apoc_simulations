// After Earth is gone: you, drifting in space. The Sun has thrown off its outer layers: a glowing shell of gas (a
// planetary nebula) spreads out around the tiny, white-hot core left behind (a white dwarf, about the size of Earth)
// and fades. The sky: the stars of our galaxy (by then merged with Andromeda into one big ball of stars), a few
// other galaxies far off. As the universe expands, those galaxies redden and slip out of sight (gone by ~100-150
// billion years). Toward a trillion years the white dwarf cools from blue-white to a dull red ember and the stars
// left are mostly faint red dwarfs.
import * as THREE from 'three';
import { makeCrowd } from './crowd.js';
import { makeGlows } from './glows.js';
import { YOU_COL } from './people.js';
import { V_ENGULF, V_100B, V_1T } from './timeline.js';
import { smooth, clamp, lerp } from './util.js';
import { blackbody } from './sky.js';

const skyFrag = /* glsl */ `
precision highp float;
varying vec3 vDir;
uniform float uGal; uniform float uRed; uniform float uNeb; uniform float uNebR; uniform vec3 uWD; uniform float uGlow; uniform float uTime;
float hash13(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
float noise3(vec3 p) { vec3 i = floor(p); vec3 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash13(i), hash13(i + vec3(1,0,0)), f.x), mix(hash13(i + vec3(0,1,0)), hash13(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(hash13(i + vec3(0,0,1)), hash13(i + vec3(1,0,1)), f.x), mix(hash13(i + vec3(0,1,1)), hash13(i + vec3(1,1,1)), f.x), f.y), f.z); }
float fbm3(vec3 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * noise3(p); p = p * 2.03 + 7.1; a *= 0.5; } return s; }
vec3 stars(vec3 v, float scale, float thr, float bright) {
  vec3 sp = v * scale;
  vec3 ci = floor(sp);
  float st = hash13(ci);
  if (st < thr) return vec3(0.0);
  vec3 cp = ci + 0.5 + (vec3(hash13(ci + 1.7), hash13(ci + 4.1), hash13(ci + 9.3)) - 0.5) * 0.6;
  float d = length(sp - cp);
  float b = pow((st - thr) / (1.0 - thr), 3.0) * bright;
  float tcol = hash13(ci + 2.2);
  vec3 col = mix(vec3(0.75, 0.85, 1.0), vec3(1.0, 0.75, 0.5), tcol);
  col = mix(col, vec3(1.0, 0.45, 0.25), uRed);
  return col * b * exp(-d * d * 16.0) * mix(1.0, 0.55 + 0.45 * step(0.6, tcol), uRed);
}
void main() {
  vec3 v = normalize(vDir);
  vec3 c = vec3(0.0015, 0.002, 0.004);
  // our galaxy, merged into one huge elliptical ball of stars: a smooth glow, brightest toward its centre
  vec3 gc = normalize(vec3(-0.5, 0.25, -0.8));
  float g = pow(max(dot(v, gc), 0.0), 2.0) * 0.08 + exp(-acos(clamp(dot(v, gc), -1.0, 1.0)) * 2.2) * 0.12;
  c += mix(vec3(1.0, 0.85, 0.65), vec3(1.0, 0.55, 0.35), uRed) * g * (0.8 + 0.4 * fbm3(v * 4.0)) * (1.0 - 0.5 * uRed);
  c += stars(v, 300.0, 0.975, 2.2) + stars(v, 700.0, 0.985, 1.2) * (1.0 - 0.4 * uRed);
  // other galaxies, far off: small tilted spirals; redder and fainter as they recede, then gone
  for (int k = 0; k < 9; k++) {
    float fk = float(k);
    vec3 gd = normalize(vec3(sin(fk * 2.4 + 0.5) * 0.9, cos(fk * 1.7) * 0.5 + 0.1, -0.6 - 0.4 * cos(fk * 0.9)));
    vec3 a1 = normalize(cross(gd, vec3(0.3, 1.0, 0.1))), a2 = cross(gd, a1);
    vec2 q = vec2(dot(v, a1), dot(v, a2)) / (0.012 + 0.008 * fract(fk * 0.37));
    float cs = cos(fk), sn = sin(fk); q = mat2(cs, -sn, sn, cs) * q; q.y *= 2.2;
    float r = length(q);
    float arms = 0.5 + 0.5 * sin(atan(q.y, q.x) * 2.0 - r * 3.5);
    float gl = (exp(-r * r * 3.0) * 1.2 + exp(-r * 1.6) * arms * 0.6) * step(0.0, dot(v, gd));
    c += mix(vec3(0.85, 0.9, 1.0), vec3(1.0, 0.25, 0.1), 1.0 - uGal) * gl * 0.35 * uGal * uGal;
  }
  // inside the expanding shell of gas the Sun threw off: hot glowing gas all around at first
  float d = acos(clamp(dot(v, normalize(uWD)), -1.0, 1.0));
  if (uNeb > 0.0) {
    float n = fbm3(v * 3.0 + vec3(0.0, 0.0, uTime * 0.05));
    float n2 = fbm3(v * 9.0 - vec3(uTime * 0.04));
    // the ring seen around the white dwarf: blue-green inside, red at the rim, threads of gas
    float ring = exp(-pow((d - uNebR) / (0.35 * uNebR + 0.02), 2.0));
    float inner = exp(-pow(d / (0.8 * uNebR + 0.02), 2.0));
    vec3 neb = vec3(0.2, 0.85, 0.75) * inner * 0.5 + vec3(1.0, 0.25, 0.18) * ring * (0.6 + 0.8 * n2);
    neb *= 0.6 + 0.8 * n;
    c += neb * uNeb * 1.4;
  }
  c += uGlow * vec3(1.0, 0.72, 0.42) * (0.6 + 0.6 * fbm3(v * 2.0 + uTime * 0.1));
  gl_FragColor = vec4(c, 1.0);
}`;

export function makeSpace() {
  const scene = new THREE.Scene();
  const u = { uGal: { value: 1 }, uRed: { value: 0 }, uNeb: { value: 0 }, uNebR: { value: 0.2 }, uWD: { value: new THREE.Vector3(-0.2, 0.3, -1) }, uGlow: { value: 0 }, uTime: { value: 0 } };
  const sky = new THREE.Mesh(new THREE.SphereGeometry(1000, 64, 32), new THREE.ShaderMaterial({
    uniforms: u, side: THREE.BackSide, depthWrite: false, depthTest: false,
    vertexShader: `varying vec3 vDir; void main(){ vec4 wp = modelMatrix * vec4(position,1.0); vDir = wp.xyz - cameraPosition; gl_Position = projectionMatrix * viewMatrix * wp; gl_Position.z = gl_Position.w * 0.99999; }`,
    fragmentShader: skyFrag,
  }));
  sky.frustumCulled = false; sky.renderOrder = -10;
  scene.add(sky);
  // the white dwarf: a brilliant point (with a soft glow) that cools and reddens
  const glows = makeGlows(scene, 16);
  // its light on you, and a dim fill
  const key = new THREE.DirectionalLight(0xffffff, 2.5);
  const fill = new THREE.HemisphereLight(0x2a3550, 0x0a0a10, 0.5);
  const rim = new THREE.DirectionalLight(0xffc89a, 1.2);   // the glow of the gas around you, from the side
  rim.position.set(-6, 2, 3);
  scene.add(key, key.target, fill, rim);
  // you, floating
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85 });
  const crowd = makeCrowd(scene, 1, mat, { castShadow: false });
  crowd.color(0, ...YOU_COL);
  const YOUP = new THREE.Vector3(0.9, 0.3, -9.0);   // upper right, clear of the counter and captions
  const col = new THREE.Color(), wdC = new THREE.Color();
  return {
    scene,
    youPos: YOUP,
    frame(v, camera) {
      const t = v - V_ENGULF;
      u.uTime.value = v;
      u.uGlow.value = 0.9 * (1 - smooth(0.2, 1.6, t));                       // still inside the hot gas
      u.uNeb.value = smooth(0.3, 1.2, t) * (1 - smooth(2.6, 4.2, t));
      u.uNebR.value = 0.12 + 0.18 * smooth(0.0, 4.0, t);
      u.uGal.value = 1 - smooth(V_100B - 1.6, V_100B + 0.2, v);
      u.uRed.value = smooth(V_100B, V_1T + 0.3, v);
      const wd = u.uWD.value.clone().normalize().multiplyScalar(600);
      // the white dwarf: ~100,000 K blue-white when new, a few thousand K and dull red by a trillion years
      const T = lerp(30000, 2600, smooth(V_ENGULF + 1, V_1T + 0.5, v));
      blackbody(T, wdC);
      const bright = lerp(3.5, 0.6, smooth(V_ENGULF + 1, V_1T + 0.5, v));
      glows.begin();
      glows.add(wd.x, wd.y, wd.z, 3.2 * (0.8 + 0.4 * bright / 3.5), wdC.r * bright * 4, wdC.g * bright * 4, wdC.b * bright * 4);
      glows.add(wd.x, wd.y, wd.z, 40, wdC.r * bright * 0.25, wdC.g * bright * 0.25, wdC.b * bright * 0.25);
      glows.end();
      key.position.copy(wd).normalize().multiplyScalar(50); key.target.position.set(0, 0, 0);
      key.color.copy(wdC); key.intensity = 0.6 + 0.9 * bright;
      rim.intensity = 0.5 + 1.6 * u.uGlow.value + 0.8 * u.uNeb.value;
      // you drift and slowly turn
      const a = v * 0.12;
      crowd.pose(0, { x: YOUP.x + Math.sin(v * 0.3) * 0.08, y: YOUP.y + Math.sin(v * 0.4) * 0.06, z: YOUP.z, yaw: Math.PI - 0.5 + a * 0.6, pitch: 0.25 + Math.sin(v * 0.5) * 0.06, roll: 0.15 * Math.sin(a), armL: 0.5 + 0.2 * Math.sin(v * 0.7), armR: 0.6 + 0.2 * Math.sin(v * 0.6 + 1), stride: 0.35, walk: 0.9 });
      crowd.commit();
      camera.position.set(0, 0, 0);
      camera.rotation.set(0.02 + Math.sin(v * 0.2) * 0.01, 0.06 + t * 0.006, 0);
    },
  };
}
