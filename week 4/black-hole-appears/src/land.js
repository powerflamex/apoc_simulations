// The ground and the planet. One frame for everything (metres): the black hole over the Strip near the origin,
// x east, -z north, y up; Earth's centre at (0, -R, 0). The ground is a cap of the sphere centred under the black
// hole, its rings log-spaced from 2 cm to 6,000 km (fine where it matters at every scale, so the land can be pulled
// into a smooth funnel): the boulevard (lanes, curbs, sidewalks, crossings, the median),
// pools of street light and neon spill, the city grid of Las Vegas beyond, the dark desert and the mountains that
// ring the valley; far off it hands over to the NASA maps (Blue Marble / Black Marble, public domain) that the globe
// draws. Both are pulled toward the black hole in the vertex shader (pull.js, strength groundK), and the crushed
// ground glows.
import * as THREE from 'three';
import { R_E, BH } from './timeline.js';
import { PULL_GLSL, PU } from './pull.js';
import { W_FRONT, CURB_W, MED0, MED1, CURB_E, E_FRONT, ZX, XHALF } from './layout.js';
import { DEG } from './util.js';

export const LAT0 = 36.11, LON0 = -115.17;      // the Las Vegas Strip
export const DISK_R = 6.0e6;          // the ground is a cap of the sphere this far round it (arc length)
// the ground's strength (g): pavement and soil hold well at street scale; at km scales rock flows like a liquid
export const groundK = (r) => Math.min(40, Math.max(1.5, 400 / Math.sqrt(Math.max(r, 1))));
const GK_GLSL = 'clamp(400.0 / sqrt(max(length(%s - uB), 1.0)), 1.5, 40.0)';
// 10 p.m.: the Sun is far below the horizon to the north-west
const SUN_AZ = 315, SUN_EL = -38;
export const SUN_DIR = new THREE.Vector3(Math.sin(SUN_AZ * DEG) * Math.cos(SUN_EL * DEG), Math.sin(SUN_EL * DEG), -Math.cos(SUN_AZ * DEG) * Math.cos(SUN_EL * DEG)).normalize();
export const EARTH_C = new THREE.Vector3(0, -R_E, 0);
export const L2E = (() => {
  const la = LAT0 * DEG, lo = LON0 * DEG;
  const U = new THREE.Vector3(Math.cos(la) * Math.cos(lo), Math.cos(la) * Math.sin(lo), Math.sin(la));
  const E = new THREE.Vector3(-Math.sin(lo), Math.cos(lo), 0);
  const N = new THREE.Vector3().crossVectors(U, E);
  return new THREE.Matrix3().set(E.x, U.x, -N.x, E.y, U.y, -N.y, E.z, U.z, -N.z);
})();

export const SURF = {
  uDay: { value: null }, uNight: { value: null }, uClouds: { value: null },
  uSunL: { value: SUN_DIR.clone() }, uL2E: { value: L2E }, uTime: { value: 0 },
  uBHL: { value: new THREE.Vector3() },            // the black hole's light (colour x intensity, W-ish)
  uLamps: { value: 1 },                             // street lights on (they go out as the grid fails)
};

const SURFACE_GLSL = /* glsl */ `
uniform sampler2D uDay; uniform sampler2D uNight; uniform sampler2D uClouds; uniform vec3 uSunL; uniform mat3 uL2E; uniform float uTime;
uniform vec3 uBHL; uniform float uLamps;
float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(hash12(i), hash12(i+vec2(1,0)), f.x), mix(hash12(i+vec2(0,1)), hash12(i+vec2(1,1)), f.x), f.y); }
vec2 earthUV(vec3 n) {
  vec3 e = uL2E * n;
  float lon = atan(e.y, e.x), lat = asin(clamp(e.z, -1.0, 1.0));
  return vec2(lon / 6.2831853 + 0.5, lat / 3.14159265 + 0.5);
}
vec3 earthSurface(vec3 n, vec3 V, float cloudK, float lightK) {
  vec2 uv = earthUV(n);
  vec3 day = texture2D(uDay, uv).rgb;
  // (the night-lights map has a faint floor everywhere: take it off, or the whole night side glows brown)
  float lights = max(texture2D(uNight, uv).r - 0.14, 0.0) / 0.86;
  float cloud = texture2D(uClouds, uv).r * cloudK;
  float ndl = dot(n, uSunL);
  float water = smoothstep(0.12, 0.05, day.r + day.g * 0.4 - day.b * 0.6) * (1.0 - smoothstep(0.35, 0.6, dot(day, vec3(0.33))));
  vec3 H = normalize(uSunL + V);
  vec3 col = day * (0.006 + 1.05 * max(ndl, 0.0)) + day * vec3(0.5, 0.6, 0.85) * 0.13 * (1.0 - smoothstep(-0.2, 0.1, ndl));
  col += vec3(1.0, 0.8, 0.6) * pow(max(dot(n, H), 0.0), 400.0) * water * 1.4 * smoothstep(-0.05, 0.1, ndl);
  col += vec3(0.9, 0.35, 0.1) * exp(-pow(ndl / 0.06, 2.0)) * 0.1 * (1.0 - water * 0.5);
  float cl = smoothstep(0.2, 0.85, cloud);
  col = mix(col, vec3(1.0) * (0.006 + 1.0 * max(ndl + 0.04, 0.0)), cl * 0.9);
  float night = 1.0 - smoothstep(-0.1, 0.06, ndl);
  col += vec3(1.0, 0.62, 0.3) * pow(lights, 1.6) * 2.4 * night * (1.0 - cl * 0.7) * lightK;
  return col;
}
`;
const LOGV = /* glsl */ `#include <common>
  #include <logdepthbuf_pars_vertex>`;

// ---------- the ground disk ----------
const GROUND_FRAG = /* glsl */ `
varying vec3 vGP; varying float vHeat; varying vec3 vWW; varying float vLava;
${SURFACE_GLSL}
float band(float x, float a, float b, float w) { return smoothstep(a - w, a + w, x) * (1.0 - smoothstep(b - w, b + w, x)); }
float lineAA(float c, float period, float hw) {
  float px = max(fwidth(c), 1e-4);
  float d = abs(fract(c / period + 0.5) - 0.5) * period;
  float w = max(hw, px * 0.7);
  float cov = clamp((w - d) / px + 0.5, 0.0, 1.0) * (hw / w);
  return mix(cov, 2.0 * hw / period, smoothstep(period * 0.2, period * 0.6, px));
}
// the Las Vegas valley: lit city inside an irregular blob ~24 x 30 km round the Strip
float cityMask(vec2 p) {
  vec2 q = p / vec2(12000.0, 15000.0) + vec2(0.05, 0.1);
  float r = length(q) + 0.35 * (vnoise(p * 0.00012) - 0.5) + 0.2 * (vnoise(p * 0.0005) - 0.5);
  return 1.0 - smoothstep(0.6, 0.85, r);
}
float crossZ(float z) {
  float best = 1e9;
  ${ZX.map((c) => `best = min(best, abs(z - (${c.toFixed(1)})));`).join('\n  ')}
  return best;
}
void main() {
  #include <logdepthbuf_fragment>
  vec2 p = vGP.xz;
  float r = length(p);
  float px = max(fwidth(p.x), fwidth(p.y));
  float w = px * 0.8 + 0.01;
  float grain = vnoise(p * 3.0) * 0.5 + vnoise(p * 17.0) * 0.5;
  vec3 V = normalize(cameraPosition - vWW);
  vec3 alb = vec3(0.0); vec3 emis = vec3(0.0);
  float lampLit = 0.0;
  // ---- the Strip and its crossings ----
  float nearK = 1.0 - smoothstep(2500.0, 4000.0, r);
  if (nearK > 0.0) {
    float x = p.x, z = p.y;
    float cz = crossZ(z);
    float inX = 1.0 - smoothstep(${XHALF.toFixed(1)} - 0.3, ${XHALF.toFixed(1)} + 0.3, cz);
    vec3 asphalt = vec3(0.075, 0.075, 0.08) * (0.8 + 0.35 * grain) * (0.9 + 0.2 * vnoise(p * 0.08));
    vec3 walk = vec3(0.34, 0.31, 0.29) * (0.85 + 0.25 * grain);
    walk *= 1.0 - 0.25 * (lineAA(x, 1.2, 0.015) + lineAA(z, 1.2, 0.015));
    vec3 plaza = vec3(0.22, 0.2, 0.2) * (0.85 + 0.2 * grain);
    float road = band(x, ${CURB_W.toFixed(1)}, ${CURB_E.toFixed(1)}, w);
    float med = band(x, ${MED0.toFixed(1)}, ${MED1.toFixed(1)}, w) * (1.0 - inX);
    float sw = band(x, ${W_FRONT.toFixed(1)}, ${CURB_W.toFixed(1)}, w) + band(x, ${CURB_E.toFixed(1)}, ${E_FRONT.toFixed(1)}, w);
    vec3 c = plaza;
    c = mix(c, walk, clamp(sw, 0.0, 1.0));
    c = mix(c, asphalt, max(road, inX * band(x, ${(W_FRONT - 40).toFixed(1)}, ${(E_FRONT + 40).toFixed(1)}, w)));
    // lane lines (dashed white), the yellow edge by the median, the curbs
    float dash = step(0.5, fract(z / 9.0));
    float lanes = 0.0;
    for (int i = 0; i < 2; i++) { float lx = ${CURB_W.toFixed(1)} + 3.6 * float(i + 1); lanes += band(x, lx - 0.06, lx + 0.06, w) * dash; }
    for (int i = 0; i < 2; i++) { float lx = ${MED1.toFixed(1)} + 3.6 * float(i + 1); lanes += band(x, lx - 0.06, lx + 0.06, w) * dash; }
    c = mix(c, vec3(0.75), clamp(lanes, 0.0, 1.0) * (1.0 - inX) * 0.8);
    float yel = band(x, ${(MED0 - 0.3).toFixed(1)}, ${(MED0 - 0.15).toFixed(2)}, w) + band(x, ${(MED1 + 0.15).toFixed(2)}, ${(MED1 + 0.3).toFixed(1)}, w);
    c = mix(c, vec3(0.75, 0.6, 0.15), clamp(yel, 0.0, 1.0) * (1.0 - inX));
    float curb = band(x, ${(CURB_W - 0.25).toFixed(2)}, ${CURB_W.toFixed(2)}, w) + band(x, ${CURB_E.toFixed(2)}, ${(CURB_E + 0.25).toFixed(2)}, w) + band(x, ${MED0.toFixed(2)}, ${(MED0 + 0.25).toFixed(2)}, w) + band(x, ${(MED1 - 0.25).toFixed(2)}, ${MED1.toFixed(2)}, w);
    c = mix(c, vec3(0.55, 0.53, 0.5), clamp(curb, 0.0, 1.0) * (1.0 - inX));
    c = mix(c, vec3(0.09, 0.11, 0.06) * (0.7 + 0.6 * grain), med * band(x, ${(MED0 + 0.25).toFixed(2)}, ${(MED1 - 0.25).toFixed(2)}, w));
    // zebra crossings at the intersections
    float zeb = band(cz, ${XHALF.toFixed(1)} - 4.2, ${XHALF.toFixed(1)} - 0.8, w) * step(0.5, fract(x / 1.2)) * band(x, ${(W_FRONT + 1).toFixed(1)}, ${(E_FRONT - 1).toFixed(1)}, w);
    c = mix(c, vec3(0.8), zeb * 0.8);
    // street lights: orange pools under the lamps on both curbs, every 32 m
    float zw = z - 7.0, ze = z - 23.0;
    float dW = length(vec2(x - ${(CURB_W + 0.5).toFixed(1)}, zw - floor(zw / 32.0 + 0.5) * 32.0));
    float dE = length(vec2(x - ${(CURB_E - 0.5).toFixed(1)}, ze - floor(ze / 32.0 + 0.5) * 32.0));
    float strip = band(x, -60.0, 100.0, 4.0) * (1.0 - smoothstep(1500.0, 2600.0, abs(z)));
    lampLit = (exp(-dW * dW / 40.0) + exp(-dE * dE / 40.0)) * strip * uLamps;
    // neon spill on the sidewalks from the casino fronts: pink, blue, gold, changing along the Strip
    vec3 tint = 0.5 + 0.5 * cos(6.2831 * (vec3(0.0, 0.33, 0.67) + floor(z / 37.0) * 0.21));
    float spill = exp(-max(x - ${W_FRONT.toFixed(1)}, 0.0) / 5.0) * step(${(W_FRONT - 0.5).toFixed(1)}, x) + exp(-max(${E_FRONT.toFixed(1)} - x, 0.0) / 5.0) * step(x, ${(E_FRONT + 0.5).toFixed(1)});
    emis += c * tint * spill * 0.3 * strip * uLamps;
    emis += c * vec3(0.55, 0.42, 0.3) * 0.06 * strip * uLamps;            // the general glow of the Strip
    // the city grid beyond the resorts: streets every 160 m with their lights, blocks of houses and parking
    float off = band(x, -330.0, 360.0, 20.0);
    vec2 gq = p / 160.0;
    float st = max(lineAA(p.x, 160.0, 6.0), lineAA(p.y, 160.0, 6.0));
    vec3 blk = vec3(0.12, 0.11, 0.1) * (0.7 + 0.5 * vnoise(p * 0.05));
    vec3 cg = mix(blk, asphalt, st);
    vec2 sl = abs(fract(p / 40.0) - 0.5) * 40.0;
    float dots = (exp(-pow(min(sl.x, sl.y), 2.0) / 3.0) * st);
    vec3 ce = vec3(1.0, 0.6, 0.25) * dots * 0.9 * uLamps;
    c = mix(c, cg, 1.0 - off);
    emis = mix(emis, ce + blk * vec3(0.4, 0.3, 0.2) * 0.25 * uLamps, 1.0 - off);
    alb = c;
    alb *= nearK; emis *= nearK;
  }
  // ---- the valley seen from above: city lights in a grid, the dark desert, the mountains ----
  {
    float k = smoothstep(2000.0, 4000.0, r);
    float cm = cityMask(p);
    vec3 desert = vec3(0.1, 0.085, 0.07) * (0.6 + 0.6 * vnoise(p * 0.0007)) * (0.8 + 0.4 * vnoise(p * 0.01));
    float st = max(lineAA(p.x, 800.0, 12.0), lineAA(p.y, 800.0, 12.0));
    float st2 = max(lineAA(p.x + 200.0, 200.0, 4.0), lineAA(p.y + 120.0, 200.0, 4.0));
    float spark = smoothstep(0.75, 0.95, vnoise(p * 0.02));
    vec3 lights = vec3(1.0, 0.62, 0.28) * (st * 1.6 + st2 * 0.6 + spark * 0.3) * cm * uLamps;
    // the far suburbs thin out
    lights *= 0.4 + 0.6 * cityMask(p * 1.3);
    alb = mix(alb, mix(desert, vec3(0.13, 0.12, 0.11), cm), k);
    emis = mix(emis, lights * 0.9, k);
  }
  // ---- far off: the maps ----
  vec3 n = normalize(vGP - vec3(0.0, ${(-R_E).toFixed(1)}, 0.0));
  float farK = smoothstep(16000.0, 28000.0, r);
  vec3 col = alb * (0.02 + 0.55 * lampLit * vec3(1.0, 0.62, 0.3)) + emis;
  col += alb * vec3(0.5, 0.6, 0.85) * 0.1 * smoothstep(1500.0, 5000.0, r);
  // lit by the black hole's glow (the crushed matter round it)
  {
    vec3 L = uB - vWW; float d2 = max(dot(L, L), 1.0);
    float ndl = max(dot(normalize(L), vec3(0.0, 1.0, 0.0)), 0.0) * 0.8 + 0.2;
    col += alb * uBHL * ndl / d2 * 0.6;
  }
  col = mix(col, earthSurface(n, V, 1.0, smoothstep(35000.0, 70000.0, r)), farK);
  // crushed ground glows
  col += vec3(1.4, 0.22, 0.04) * vLava * (0.6 + 0.4 * vnoise(vGP.xz * 3e-4 + uTime * 0.2)) * smoothstep(2000.0, 20000.0, r);
  col += vec3(3.2, 1.0, 0.25) * vHeat * vHeat * 1.2 + vec3(2.8, 2.2, 1.6) * pow(vHeat, 5.0);
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

// mountains round the valley (heights in metres, from the disk's pre-pull position)
const MOUNT_GLSL = /* glsl */ `
float mh(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  float a = fract(sin(dot(i, vec2(127.1, 311.7))) * 43758.5453), b = fract(sin(dot(i + vec2(1,0), vec2(127.1, 311.7))) * 43758.5453);
  float c = fract(sin(dot(i + vec2(0,1), vec2(127.1, 311.7))) * 43758.5453), d = fract(sin(dot(i + vec2(1,1), vec2(127.1, 311.7))) * 43758.5453);
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y); }
float mountains(vec2 p) {
  float r = length(p);
  float ring = smoothstep(17000.0, 22000.0, r) * (1.0 - smoothstep(32000.0, 40000.0, r));
  // the Spring Mountains (west) are the highest
  float west = 1.0 + 1.2 * smoothstep(0.0, -1.0, p.x / max(r, 1.0));
  float h = 0.0, a = 1.0, s = 1.0 / 9000.0;
  for (int i = 0; i < 4; i++) { h += a * (1.0 - abs(mh(p * s) * 2.0 - 1.0)); s *= 2.1; a *= 0.5; }
  return ring * west * h * 900.0;
}`;

export function makeLand(scene) {
  const loader = new THREE.TextureLoader();
  const waits = [];
  const load = (f, srgb) => {
    let done;
    waits.push(new Promise((res, rej) => { done = [res, rej]; }));
    const t = loader.load(f, () => done[0](), undefined, () => done[1](new Error('could not load ' + f)));
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; t.anisotropy = 8; t.wrapS = THREE.RepeatWrapping;
    return t;
  };
  SURF.uDay.value = load('textures/earth_day.jpg', true);
  SURF.uNight.value = load('textures/earth_night.jpg', false);
  SURF.uClouds.value = load('textures/earth_clouds.jpg', false);
  const ready = Promise.all(waits);

  // ---------- the ground: a cap of the sphere, rings log-spaced from 2 cm to DISK_R, centred under the black hole ----------
  const NR = 300, NS = 400;
  const radii = [0];
  for (let i = 0; i < NR; i++) radii.push(0.02 * Math.pow(DISK_R / 0.02, i / (NR - 1)));
  const pos = new Float32Array(radii.length * NS * 3);
  const idx = [];
  radii.forEach((r, i) => {
    for (let j = 0; j < NS; j++) {
      const a = (j / NS) * Math.PI * 2;
      const o = (i * NS + j) * 3;
      pos[o] = Math.cos(a) * r; pos[o + 1] = 0; pos[o + 2] = Math.sin(a) * r;
    }
  });
  for (let i = 0; i < radii.length - 1; i++) for (let j = 0; j < NS; j++) {
    const a = i * NS + j, b = i * NS + (j + 1) % NS, c = (i + 1) * NS + j, d = (i + 1) * NS + (j + 1) % NS;
    idx.push(a, b, c, b, d, c);
  }
  const gg = new THREE.BufferGeometry();
  gg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  gg.setIndex(idx);
  const groundMat = new THREE.ShaderMaterial({
    uniforms: { ...SURF, ...PU },
    vertexShader: /* glsl */ `
      varying vec3 vGP; varying float vHeat; varying vec3 vWW; varying float vLava;
      ${LOGV}
      ${PULL_GLSL}
      ${MOUNT_GLSL}
      void main() {
        // (arc length s along the ground -> the sphere; written so float precision holds from 2 cm to 6,000 km)
        float s = length(position.xz);
        vec2 dir = position.xz / max(s, 1e-9);
        vec3 p;
        p.xz = vec2(${BH.x.toFixed(2)}, ${BH.z.toFixed(2)}) + dir * ${R_E.toFixed(1)} * sin(s / ${R_E.toFixed(1)});
        float hs = sin(s / ${(2 * R_E).toFixed(1)});
        p.y = -${(2 * R_E).toFixed(1)} * hs * hs + mountains(p.xz);
        vGP = p;
        float gk = ${GK_GLSL.replace('%s', 'p')};
        vec3 w = pullWarp(p, gk, 0.0, 0.0, vHeat);
        { vec3 dd = p - uB; vLava = smoothstep(0.35, 4.0, uGM / max(dot(dd, dd), 1e-6) / 9.81 / gk); }
        vWW = w;
        gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: `uniform vec3 uB;
      #include <common>
      #include <logdepthbuf_pars_fragment>
      ${GROUND_FRAG}`,
  });
  const ground = new THREE.Mesh(gg, groundMat);
  ground.frustumCulled = false;
  scene.add(ground);

  // ---------- the globe (beyond the disk) ----------
  // (400 m below the ground cap, so the cap draws over it; it shows beyond the cap and wherever the cap is pulled away)
  const globeU = { ...SURF, ...PU };
  const globeMat = new THREE.ShaderMaterial({
    uniforms: globeU,
    vertexShader: /* glsl */ `
      varying vec3 vN; varying vec3 vW; varying float vHeat; varying float vLava;
      ${LOGV}
      ${PULL_GLSL}
      void main() {
        vN = normalize(mat3(modelMatrix) * position);
        vec4 w0 = modelMatrix * vec4(position, 1.0);
        float gk = ${GK_GLSL.replace('%s', 'w0.xyz')};
        vec3 w = pullWarp(w0.xyz, gk, 0.0, 0.0, vHeat);
        { vec3 dd = w0.xyz - uB; vLava = smoothstep(0.35, 4.0, uGM / max(dot(dd, dd), 1e-6) / 9.81 / gk); }
        vW = w;
        gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: /* glsl */ `
      varying vec3 vN; varying vec3 vW; varying float vHeat; varying float vLava;
      #include <common>
      #include <logdepthbuf_pars_fragment>
      ${SURFACE_GLSL}
      void main() {
        #include <logdepthbuf_fragment>
        vec3 col = earthSurface(normalize(vN), normalize(cameraPosition - vW), 1.0, 1.0);
        col += vec3(1.4, 0.22, 0.04) * vLava;
        col += vec3(3.2, 1.0, 0.25) * vHeat * vHeat * 1.2 + vec3(2.8, 2.2, 1.6) * pow(vHeat, 5.0);
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const globe = new THREE.Mesh(new THREE.SphereGeometry(R_E - 400, 720, 360), globeMat);
  globe.position.copy(EARTH_C);
  // (its poles turned away from Las Vegas: the pole's fan of long thin triangles right under the black hole would
  // be dragged into it and smear its heat over hundreds of km)
  globe.rotation.x = Math.PI / 2;
  globe.frustumCulled = false;
  scene.add(globe);

  // ---------- the atmosphere seen from outside (pulled in with the planet) ----------
  const atmoU = { uSunL: SURF.uSunL, uOn: { value: 0 }, ...PU };
  const atmo = new THREE.Mesh(new THREE.SphereGeometry(R_E + 90e3, 256, 128), new THREE.ShaderMaterial({
    uniforms: atmoU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `varying vec3 vN; varying vec3 vW; varying float vHeat;
      ${LOGV}
      ${PULL_GLSL}
      void main(){ vN = normalize(mat3(modelMatrix) * position); vec4 w0 = modelMatrix * vec4(position, 1.0); vec3 w = pullWarp(w0.xyz, ${GK_GLSL.replace('%s', 'w0.xyz')}, 0.0, 0.0, vHeat); vW = w; gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: /* glsl */ `uniform vec3 uSunL; uniform float uOn; varying vec3 vN; varying vec3 vW; varying float vHeat;
      #include <common>
      #include <logdepthbuf_pars_fragment>
      void main(){
        #include <logdepthbuf_fragment>
        vec3 V = normalize(cameraPosition - vW);
        float rim = pow(1.0 - max(dot(normalize(vN), V), 0.0), 2.6);
        float ndl = dot(normalize(vN), uSunL);
        vec3 c = mix(vec3(0.22, 0.48, 1.0), vec3(1.0, 0.45, 0.18), exp(-pow(ndl / 0.14, 2.0)) * 0.8) * smoothstep(-0.25, 0.25, ndl) * rim * 1.8;
        gl_FragColor = vec4(c * uOn * (1.0 - vHeat), 1.0);
      }`,
  }));
  atmo.position.copy(EARTH_C);
  atmo.rotation.x = Math.PI / 2;
  atmo.frustumCulled = false;
  scene.add(atmo);

  return { ready, ground, globe, globeU, atmo, atmoU };
}
