// Earth from space, for magnitude 12.5 to the end (its own scene, km, Earth's centre at the origin). NASA's Blue
// Marble / Black Marble / cloud maps (public domain). It is sunset in San Francisco, so the terminator runs just
// west of California: the Pacific in daylight, North America at night with its city lights.
// What the quake does, by magnitude (uniforms set from main.js):
//   uFault  (13): the San Andreas Fault tears open along California, a glowing seam
//   uReach  (13-16): cracks spread out from it across the continent, then the whole globe (angular reach, rad)
//   uHot    (15-17): the cracks glow wider and hotter; the oceans steam (uSteam)
//   uPlates (17): the crust breaks into plates that shift and tilt, molten rock between them
//   uMelt   (17.8): the whole surface glows
//   uBreak  (18.4): the pieces fly apart; the white-hot inside shows
import * as THREE from 'three';
import { DEG } from './util.js';

export const RE = 6371;
const LAT0 = 37.79, LON0 = -122.41;            // California St, San Francisco
export const toN = (lat, lon) => new THREE.Vector3(Math.cos(lat * DEG) * Math.cos(lon * DEG), Math.sin(lat * DEG), -Math.cos(lat * DEG) * Math.sin(lon * DEG));
export const SF = toN(LAT0, LON0);
// the San Andreas: Cape Mendocino to the Salton Sea, through the Bay Area
const FAULT = [[40.3, -124.4], [38.0, -122.8], [37.7, -122.5], [36.8, -121.5], [35.8, -120.4], [34.8, -119.0], [34.3, -117.5], [33.4, -116.0], [32.6, -115.3]].map(([a, b]) => toN(a, b));

const COMMON = /* glsl */ `
float hash13(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
vec3 hash33(vec3 p) { return vec3(hash13(p), hash13(p + 17.3), hash13(p + 41.7)); }
// 3-D cells: (distance to the nearest edge, the nearest cell's id point)
vec4 cells(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  float d1 = 9.0, d2 = 9.0; vec3 id = vec3(0.0);
  for (int z = -1; z <= 1; z++) for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec3 o = vec3(float(x), float(y), float(z));
    vec3 c = o + hash33(i + o) * 0.85;
    float d = length(c - f);
    if (d < d1) { d2 = d1; d1 = d; id = i + o; } else if (d < d2) d2 = d;
  }
  return vec4(d2 - d1, id);
}
float noise3(vec3 p) { vec3 i = floor(p); vec3 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash13(i), hash13(i + vec3(1,0,0)), f.x), mix(hash13(i + vec3(0,1,0)), hash13(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(hash13(i + vec3(0,0,1)), hash13(i + vec3(1,0,1)), f.x), mix(hash13(i + vec3(0,1,1)), hash13(i + vec3(1,1,1)), f.x), f.y), f.z); }
float fbm3(vec3 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * noise3(p); p = p * 2.03 + 7.1; a *= 0.5; } return s; }
uniform float uPlates; uniform float uBreak; uniform float uTime;
`;

export function makePlanet() {
  const scene = new THREE.Scene();
  const loader = new THREE.TextureLoader();
  const waits = [];
  const load = (f, srgb) => {
    let done;
    waits.push(new Promise((res, rej) => { done = [res, rej]; }));
    const t = loader.load(f, () => done[0](), undefined, () => done[1](new Error('could not load ' + f)));
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; t.anisotropy = 8; t.wrapS = THREE.RepeatWrapping;
    return t;
  };
  // the Sun: setting in San Francisco (on SF's western horizon), late October (declination -11°)
  const sunN = toN(-11, LON0 - 90 - 4);
  const u = {
    uDay: { value: load('textures/earth_day.jpg', true) }, uNight: { value: load('textures/earth_night.jpg', false) }, uClouds: { value: load('textures/earth_clouds.jpg', false) },
    uSun: { value: sunN }, uSF: { value: SF }, uFault: { value: 0 }, uReach: { value: 0 }, uHot: { value: 0 }, uSteam: { value: 0 },
    uPlates: { value: 0 }, uMelt: { value: 0 }, uBreak: { value: 0 }, uTime: { value: 0 },
    uFaultPts: { value: FAULT },
  };
  const ready = Promise.all(waits);
  const globe = new THREE.Mesh(new THREE.SphereGeometry(RE, 720, 360), new THREE.ShaderMaterial({
    uniforms: u,
    vertexShader: /* glsl */ `
      ${COMMON}
      varying vec3 vN; varying vec3 vW; varying float vTear;
      void main() {
        vec3 n = normalize(position);
        vN = n;
        vec3 p = position;
        vTear = 0.0;
        if (uPlates > 0.0 || uBreak > 0.0) {
          vec3 nq = n + (vec3(fbm3(n * 5.0), fbm3(n * 5.0 + 3.1), fbm3(n * 5.0 + 6.2)) - 0.5) * 0.35;
          vec4 c = cells(nq * 3.2);
          vec3 cd = normalize(c.yzw + 0.5);
          float r = hash13(c.yzw);
          // plates: each lifts or sinks a little and tilts (molten seams open between)
          p += n * uPlates * (r - 0.4) * 90.0;
          // breaking apart: each piece flies out along its own direction, turning
          float fly = uBreak * (0.55 + 0.9 * r) * ${RE.toFixed(1)};
          p += cd * fly;
          vTear = smoothstep(0.08, 0.0, c.x) * max(uPlates, step(0.001, uBreak));
        }
        vec4 w = modelMatrix * vec4(p, 1.0); vW = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */ `
      ${COMMON}
      uniform sampler2D uDay; uniform sampler2D uNight; uniform sampler2D uClouds; uniform vec3 uSun; uniform vec3 uSF;
      uniform float uFault; uniform float uReach; uniform float uHot; uniform float uSteam; uniform float uMelt;
      uniform vec3 uFaultPts[9];
      varying vec3 vN; varying vec3 vW; varying float vTear;
      vec2 uvOf(vec3 n) { float lon = atan(-n.z, n.x), lat = asin(clamp(n.y, -1.0, 1.0)); return vec2(lon / 6.2831853 + 0.5, lat / 3.14159265 + 0.5); }
      // angular distance (rad) from n to the fault line
      float faultD(vec3 n) {
        float d = 9.0;
        for (int i = 0; i < 8; i++) {
          vec3 a = uFaultPts[i], b = uFaultPts[i + 1];
          vec3 ab = b - a; float t = clamp(dot(n - a, ab) / dot(ab, ab), 0.0, 1.0);
          d = min(d, length(n - (a + ab * t)));
        }
        return d;
      }
      vec3 lava(float k) { return mix(vec3(0.5, 0.04, 0.0), mix(vec3(1.6, 0.45, 0.06), vec3(2.2, 1.5, 0.7), smoothstep(0.7, 1.0, k)), smoothstep(0.0, 0.6, k)); }
      void main() {
        vec3 n = normalize(vN);
        vec3 V = normalize(cameraPosition - vW);
        vec2 uv = uvOf(n);
        vec3 day = texture2D(uDay, uv).rgb;
        float lights = texture2D(uNight, uv).r;
        float cloud = texture2D(uClouds, uv + vec2(uTime * 0.0006, 0.0)).r;
        float ndl = dot(n, uSun);
        float water = smoothstep(0.12, 0.05, day.r + day.g * 0.4 - day.b * 0.6) * (1.0 - smoothstep(0.35, 0.6, dot(day, vec3(0.33))));
        vec3 H = normalize(uSun + V);
        vec3 col = day * (0.015 + 1.05 * max(ndl, 0.0));
        col += vec3(1.0, 0.8, 0.6) * pow(max(dot(n, H), 0.0), 400.0) * water * smoothstep(-0.05, 0.1, ndl) * (1.0 - uSteam);
        col += vec3(0.9, 0.35, 0.1) * exp(-pow(ndl / 0.06, 2.0)) * 0.04;
        float night = 1.0 - smoothstep(-0.1, 0.06, ndl);
        col += vec3(1.0, 0.62, 0.3) * pow(lights, 1.5) * 2.0 * night * (1.0 - smoothstep(0.3, 0.9, uReach));
        float cl = smoothstep(0.2, 0.85, cloud) * (1.0 - 0.5 * uHot);
        col = mix(col, vec3(1.0) * (0.015 + 1.0 * max(ndl + 0.04, 0.0)), cl * 0.85);
        // the oceans boiling: white steam welling up over the water, lit by the glow underneath at night
        float st = uSteam * water * smoothstep(0.55, 0.8, fbm3(n * 14.0 + vec3(0.0, uTime * 0.05, 0.0)) + uSteam * 0.15);
        col = mix(col, vec3(0.85, 0.85, 0.82) * (0.05 + 0.9 * max(ndl + 0.1, 0.0)), st * 0.7);
        // cracks: the fault first, then a spreading web (cell edges at two scales), hotter and wider over time
        float glow = 0.0;
        float fd = faultD(n);
        glow = max(glow, (1.0 - smoothstep(0.0, 0.002 + 0.004 * uHot, fd)) * uFault);
        glow = max(glow, (1.0 - smoothstep(0.0, 0.02, fd)) * uFault * 0.3);
        float sfd = acos(clamp(dot(n, uSF), -1.0, 1.0));
        float reachK = smoothstep(uReach, uReach - 0.15, sfd + (fbm3(n * 6.0) - 0.5) * 0.25);
        if (reachK > 0.0) {
          vec3 nw = n + (vec3(fbm3(n * 12.0), fbm3(n * 12.0 + 3.1), fbm3(n * 12.0 + 6.2)) - 0.5) * 0.06;   // jagged, not straight
          float e1 = cells(nw * 16.0).x, e2 = cells(nw * 45.0 + 4.0).x;
          float w1 = 0.008 + 0.03 * uHot, w2 = 0.008 + 0.02 * uHot;
          glow = max(glow, (1.0 - smoothstep(0.0, w1, e1)) * reachK);
          glow = max(glow, (1.0 - smoothstep(0.0, w2, e2)) * reachK * smoothstep(0.2, 0.8, uHot + 0.3) * 0.8);
        }
        // the plates' seams, then the whole surface melting
        vec3 np = n + (vec3(fbm3(n * 5.0), fbm3(n * 5.0 + 3.1), fbm3(n * 5.0 + 6.2)) - 0.5) * 0.35;
        float pe = cells(np * 3.2).x;
        glow = max(glow, (1.0 - smoothstep(0.0, 0.012 + 0.025 * uPlates, pe)) * uPlates);
        col = mix(col, col * 0.3 + lava(0.25 + 0.35 * fbm3(n * 20.0 + uTime * 0.1)) * 0.5, uMelt);
        col = mix(col, lava(glow * (0.6 + 0.4 * uHot)), clamp(glow, 0.0, 1.0));
        col = mix(col, lava(0.8), vTear);
        gl_FragColor = vec4(col, 1.0);
      }`,
  }));
  globe.frustumCulled = false;
  scene.add(globe);
  // the inside: white-hot, seen through the seams and when the pieces fly apart
  const core = new THREE.Mesh(new THREE.SphereGeometry(RE * 0.985, 128, 64), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 1.5, 0.7) }));
  scene.add(core);
  // the air: a thin blue rim, warm at the terminator
  const atmo = new THREE.Mesh(new THREE.SphereGeometry(RE + 100, 128, 64), new THREE.ShaderMaterial({
    uniforms: { uSun: u.uSun, uFade: { value: 1 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.BackSide,
    vertexShader: `varying vec3 vN; varying vec3 vW; void main(){ vN = normalize(position); vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `uniform vec3 uSun; uniform float uFade; varying vec3 vN; varying vec3 vW; void main(){
      vec3 V = normalize(cameraPosition - vW); vec3 n = normalize(vN);
      float rim = pow(1.0 - abs(dot(n, V)), 3.0);
      float lit = smoothstep(-0.3, 0.4, dot(n, uSun));
      vec3 c = mix(vec3(1.0, 0.45, 0.2), vec3(0.3, 0.55, 1.0), smoothstep(-0.05, 0.4, dot(n, uSun)));
      gl_FragColor = vec4(c * rim * lit * 1.5 * uFade, 1.0); }`,
  }));
  scene.add(atmo);
  // stars
  {
    const N = 5000, p = new Float32Array(N * 3), cA = new Float32Array(N * 3);
    let s = 7;
    const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < N; i++) {
      const z = r() * 2 - 1, a = r() * 6.283, q = Math.sqrt(1 - z * z);
      p.set([Math.cos(a) * q * 1e6, z * 1e6, Math.sin(a) * q * 1e6], i * 3);
      const b = Math.pow(r(), 4) * 1.5 + 0.1;
      cA.set([b, b * 0.97, b * (0.9 + r() * 0.2)], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    g.setAttribute('color', new THREE.BufferAttribute(cA, 3));
    const stars = new THREE.Points(g, new THREE.PointsMaterial({ size: 2.2, sizeAttenuation: false, vertexColors: true }));
    stars.frustumCulled = false;
    scene.add(stars);
  }
  return { scene, u, ready, globe, core, atmo };
}
