// Earth from space, from 30 s to the end (its own scene, km, Earth's centre at the origin). NASA's Blue Marble /
// Black Marble / cloud maps (public domain, copied from quake-grows). It is dusk in Seattle (the terminator just
// west of the coast): the Pacific in the last daylight, North America at night with its city lights.
// What the antimatter storm does (uniforms set from main.js):
//   uFlash  the storm over Seattle: a blinding point that never stops flashing
//   uR      how far the combined blast has flattened everything (angular radius, rad): fires and ash inside, the
//           shock front a bright ring lifting the cloud deck
//   uEnd    the last seconds: the whole surface white-hot
import * as THREE from 'three';
import { DEG } from './util.js';

export const RE = 6371;
const LAT0 = 47.61, LON0 = -122.34;            // Pike Place Market, Seattle
export const toN = (lat, lon) => new THREE.Vector3(Math.cos(lat * DEG) * Math.cos(lon * DEG), Math.sin(lat * DEG), -Math.cos(lat * DEG) * Math.sin(lon * DEG));
export const SEA = toN(LAT0, LON0);

const COMMON = /* glsl */ `
float hash13(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
float noise3(vec3 p) { vec3 i = floor(p); vec3 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash13(i), hash13(i + vec3(1,0,0)), f.x), mix(hash13(i + vec3(0,1,0)), hash13(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(hash13(i + vec3(0,0,1)), hash13(i + vec3(1,0,1)), f.x), mix(hash13(i + vec3(0,1,1)), hash13(i + vec3(1,1,1)), f.x), f.y), f.z); }
float fbm3(vec3 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * noise3(p); p = p * 2.03 + 7.1; a *= 0.5; } return s; }
uniform float uTime; uniform vec3 uSea; uniform float uR; uniform float uFlash; uniform float uEnd;
vec3 fireC(float k) { return mix(vec3(0.35, 0.03, 0.0), mix(vec3(1.7, 0.5, 0.08), vec3(2.6, 1.9, 1.1), smoothstep(0.65, 1.0, k)), smoothstep(0.0, 0.6, k)); }
// angle (rad) from Seattle, a little ragged so the front isn't a perfect circle
float angSea(vec3 n) { return acos(clamp(dot(n, uSea), -1.0, 1.0)) + (fbm3(n * 9.0) - 0.5) * 0.18 * uR; }
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
  // the Sun: just set in Seattle (on its western horizon), late October (declination -13°)
  const sunN = toN(-13, LON0 - 90 - 6);
  const u = {
    uDay: { value: load('textures/earth_day.jpg', true) }, uNight: { value: load('textures/earth_night.jpg', false) }, uClouds: { value: load('textures/earth_clouds.jpg', false) },
    uSun: { value: sunN }, uSea: { value: SEA }, uR: { value: 0 }, uFlash: { value: 1 }, uEnd: { value: 0 }, uTime: { value: 0 },
  };
  const ready = Promise.all(waits);
  const globe = new THREE.Mesh(new THREE.SphereGeometry(RE, 512, 256), new THREE.ShaderMaterial({
    uniforms: u,
    vertexShader: /* glsl */ `
      varying vec3 vN; varying vec3 vW;
      void main() { vN = normalize(position); vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */ `
      ${COMMON}
      uniform sampler2D uDay; uniform sampler2D uNight; uniform sampler2D uClouds; uniform vec3 uSun;
      varying vec3 vN; varying vec3 vW;
      vec2 uvOf(vec3 n) { float lon = atan(-n.z, n.x), lat = asin(clamp(n.y, -1.0, 1.0)); return vec2(lon / 6.2831853 + 0.5, lat / 3.14159265 + 0.5); }
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
        col += vec3(1.0, 0.8, 0.6) * pow(max(dot(n, H), 0.0), 400.0) * water * smoothstep(-0.05, 0.1, ndl);
        col += vec3(0.9, 0.35, 0.1) * exp(-pow(ndl / 0.06, 2.0)) * 0.04;
        float night = 1.0 - smoothstep(-0.1, 0.06, ndl);
        float a = angSea(n);
        float inside = smoothstep(uR, uR * 0.93, a);
        col += vec3(1.0, 0.62, 0.3) * pow(lights, 1.5) * 2.0 * night * (1.0 - inside);
        // the storm: a thick cloud deck round Seattle (added to the map's clouds), lit from inside
        float storm = smoothstep(0.035, 0.012, acos(clamp(dot(n, uSea), -1.0, 1.0)) + (fbm3(n * 60.0) - 0.5) * 0.02);
        cloud = max(cloud, storm * (0.6 + 0.4 * fbm3(n * 140.0)));
        float cl = smoothstep(0.2, 0.85, cloud);
        col = mix(col, vec3(1.0) * (0.015 + 1.0 * max(ndl + 0.04, 0.0)), cl * 0.85);
        // everything the blast has passed: burning ground under a churning ash cloud, hotter toward the middle
        if (inside > 0.0) {
          float q = a / max(uR, 1e-5);
          float churn = fbm3(n * 70.0 + vec3(0.0, uTime * 0.08, uTime * 0.05));
          float ash = fbm3(n * 22.0 - vec3(uTime * 0.03));
          vec3 burn = fireC(0.25 + 0.55 * churn * (1.0 - 0.5 * q) + 0.25 * (1.0 - q));
          burn = mix(burn, vec3(0.05, 0.035, 0.03) + fireC(0.3) * 0.25 * churn, smoothstep(0.45, 0.75, ash) * 0.6 * q);
          col = mix(col, burn, inside);
        }
        // the shock front: a bright ring lifting the cloud deck as it races out
        float front = exp(-pow((a - uR) / (0.03 * uR + 0.0015), 2.0));
        col += vec3(2.2, 1.3, 0.6) * front * (0.6 + 0.6 * fbm3(n * 50.0 + uTime * 0.3)) * step(0.0005, uR);
        // the storm itself: white-hot, flickering with every new burst
        float da = acos(clamp(dot(n, uSea), -1.0, 1.0));
        float spark = step(0.6, hash13(floor(n * 4000.0) + floor(uTime * 30.0)));
        col += vec3(3.5, 3.2, 3.0) * uFlash * (exp(-pow(da / 0.008, 2.0)) * 3.0 + exp(-pow(da / 0.03, 2.0)) * spark * 1.5);
        col += vec3(2.5, 1.6, 0.9) * uFlash * exp(-pow(da / (0.12 * uR + 0.004), 2.0)) * 1.5;
        // the end: the whole surface white-hot
        col = mix(col, fireC(0.75 + 0.25 * fbm3(n * 30.0 + uTime)), uEnd);
        gl_FragColor = vec4(col, 1.0);
      }`,
  }));
  globe.frustumCulled = false;
  scene.add(globe);
  // the air: a thin blue rim, warm at the terminator, burning orange over the blast
  const atmo = new THREE.Mesh(new THREE.SphereGeometry(RE + 100, 128, 64), new THREE.ShaderMaterial({
    uniforms: u, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.BackSide,
    vertexShader: `varying vec3 vN; varying vec3 vW; void main(){ vN = normalize(position); vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `${COMMON}
      uniform vec3 uSun; varying vec3 vN; varying vec3 vW; void main(){
      vec3 V = normalize(cameraPosition - vW); vec3 n = normalize(vN);
      float rim = pow(1.0 - abs(dot(n, V)), 3.0);
      float lit = smoothstep(-0.3, 0.4, dot(n, uSun));
      vec3 c = mix(vec3(1.0, 0.45, 0.2), vec3(0.3, 0.55, 1.0), smoothstep(-0.05, 0.4, dot(n, uSun))) * lit;
      float burn = max(smoothstep(uR * 1.05, uR * 0.7, acos(clamp(dot(n, uSea), -1.0, 1.0))), uEnd);
      c = mix(c, vec3(2.0, 0.8, 0.25), burn);
      gl_FragColor = vec4(c * rim * 1.5, 1.0); }`,
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
  return { scene, u, ready, globe, atmo };
}
