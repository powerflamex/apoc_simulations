// Space: one scene re-dressed for each shot (Neptune, Saturn, Jupiter, the Sun, the Moon, Earth). Units: the body's
// own radius (the body sits at the origin, radius 1). The bubble's wall: a sphere (Neptune: it formed 2 light-seconds
// away, so you can still see it curve) or, for everything later, a flat wall (it is billions of km across by then).
// Behind the wall: nothing (a dark violet void; a thin iridescent film where the wall is). Where the wall cuts a
// body, the cut edge glows and you see the cross-section (its layers), like a slice.
//   uMode 1: sphere, centre uBC, radius uBR; uMode 0: plane, points with dot(p, uN) < uW are inside (gone).
import * as THREE from 'three';
import { R, T, C_KM } from './timeline.js';

export const WALL_GLSL = /* glsl */ `
uniform float uMode; uniform vec3 uN; uniform float uW; uniform vec3 uBC; uniform float uBR; uniform float uTime;
float hash13(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
float noise3(vec3 p) { vec3 i = floor(p); vec3 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash13(i), hash13(i + vec3(1,0,0)), f.x), mix(hash13(i + vec3(0,1,0)), hash13(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(hash13(i + vec3(0,0,1)), hash13(i + vec3(1,0,1)), f.x), mix(hash13(i + vec3(0,1,1)), hash13(i + vec3(1,1,1)), f.x), f.y), f.z); }
float fbm3(vec3 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * noise3(p); p = p * 2.03 + 7.1; a *= 0.5; } return s; }
// signed distance outside the wall (> 0: still here)
float wallS(vec3 p) { return uMode > 0.5 ? length(p - uBC) - uBR : dot(p, uN) - uW; }
vec3 wallNormal(vec3 q) { return uMode > 0.5 ? normalize(q - uBC) : -uN; }   // (facing the side that's still here)
// distance along a ray from o (outside) to the wall, -1 if it never gets there
float wallHit(vec3 o, vec3 d) {
  if (uMode > 0.5) {
    vec3 oc = o - uBC; float b = dot(oc, d), c = dot(oc, oc) - uBR * uBR, h = b * b - c;
    if (h < 0.0) return -1.0;
    float t = -b - sqrt(h);
    return t > 0.0 ? t : -1.0;
  }
  float dn = dot(d, uN);
  if (dn >= -1e-6) return -1.0;
  return (uW - dot(o, uN)) / dn;
}
// what you see where your line of sight meets the wall: a nearly black violet nothing, a thin film with rainbow
// sheen that brightens where you look along it (its edge), slow faint swirls inside
vec3 voidLook(vec3 q, vec3 d, float scale) {
  vec3 n = wallNormal(q);
  float g = 1.0 - abs(dot(d, n));
  vec3 qs = d * 4.0;
  float sw = fbm3(qs * 1.3 + vec3(0.0, uTime * 0.05, 0.0));
  vec3 c = vec3(0.010, 0.006, 0.026) + vec3(0.05, 0.02, 0.11) * pow(sw, 3.0) * 0.6;
  float hue = fbm3(qs * 0.7 - vec3(uTime * 0.03)) * 2.2 + g * 1.4;
  vec3 iri = 0.5 + 0.5 * cos(6.2832 * (hue + vec3(0.0, 0.33, 0.67)));
  c += iri * pow(g, 6.0) * 0.1 + vec3(0.75, 0.7, 1.15) * pow(g, 60.0) * 0.9;
  return c;
}
const vec3 EDGE = vec3(1.25, 1.05, 1.9);
`;

const BODY_FRAG = /* glsl */ `
${WALL_GLSL}
uniform float uType; uniform vec3 uL; uniform mat3 uTilt; uniform float uScale;
uniform sampler2D uDay; uniform sampler2D uNight; uniform sampler2D uClouds;
uniform vec3 uRing;   // Saturn: ring plane normal (world), inner, outer radius
varying vec3 vW;
vec2 uvOf(vec3 n) { float lon = atan(-n.z, n.x), lat = asin(clamp(n.y, -1.0, 1.0)); return vec2(lon / 6.2831853 + 0.5, lat / 3.14159265 + 0.5); }
vec4 cells(vec3 p) {
  vec3 i = floor(p), f = fract(p); float d1 = 9.0, d2 = 9.0; vec3 id = vec3(0.0);
  for (int z = -1; z <= 1; z++) for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec3 o = vec3(float(x), float(y), float(z));
    vec3 c = o + vec3(hash13(i + o), hash13(i + o + 17.3), hash13(i + o + 41.7)) * 0.85;
    float d = length(c - f);
    if (d < d1) { d2 = d1; d1 = d; id = i + o; } else if (d < d2) d2 = d;
  }
  return vec4(d1, d2, hash13(id), hash13(id + 3.3));
}
float ringOpacity(float r) {
  // C ring (faint), B ring (dense), the Cassini Division, A ring with the Encke gap
  float o = 0.0;
  o += 0.25 * smoothstep(1.235, 1.26, r) * (1.0 - smoothstep(1.51, 1.527, r));
  o += 0.92 * smoothstep(1.52, 1.54, r) * (1.0 - smoothstep(1.94, 1.951, r));
  o += 0.62 * smoothstep(2.025, 2.035, r) * (1.0 - smoothstep(2.26, 2.27, r)) * (1.0 - 0.9 * smoothstep(0.004, 0.0, abs(r - 2.214)));
  o *= 0.8 + 0.2 * sin(r * 260.0) * sin(r * 77.0);
  return o;
}
vec3 surface(vec3 n, vec3 ln, float ndl) {
  float lat = ln.y;
  if (uType < 0.5) {   // Neptune: deep azure, faint bands, a dark storm, bright high cirrus
    float w = fbm3(ln * 3.0 + vec3(0.0, 0.0, uTime * 0.02));
    float band = sin(lat * 13.0 + w * 2.5);
    vec3 c = mix(vec3(0.05, 0.15, 0.52), vec3(0.12, 0.3, 0.78), 0.5 + 0.3 * band);
    vec2 sp = vec2(atan(ln.z, ln.x) - 0.9, (lat + 0.33) * 2.2);
    float spot = exp(-dot(sp, sp) * 30.0);
    c = mix(c, vec3(0.04, 0.10, 0.36), spot * 0.85);
    float cir = smoothstep(0.62, 0.8, fbm3(vec3(atan(ln.z, ln.x) * 2.0, lat * 40.0, 1.0)));
    cir *= exp(-pow((lat - 0.35) * 6.0, 2.0)) + exp(-pow((lat + 0.22) * 7.0, 2.0)) * 0.8;
    c = mix(c, vec3(0.9, 0.95, 1.0), cir * 0.8);
    return c;
  }
  if (uType < 1.5) {   // Saturn: pale butterscotch bands
    float w = fbm3(ln * 4.0) * 0.06;
    float b = sin((lat + w) * 30.0) * 0.5 + sin((lat + w) * 11.0 + 1.0) * 0.5;
    vec3 c = mix(vec3(0.66, 0.53, 0.33), vec3(0.88, 0.77, 0.55), 0.5 + 0.45 * b);
    c = mix(c, vec3(0.62, 0.58, 0.52), smoothstep(0.75, 0.95, abs(lat)));
    return c;
  }
  if (uType < 2.5) {   // Jupiter: cream zones, rust belts, churning edges, the Great Red Spot
    vec3 q = ln * 3.0;
    float w = (fbm3(q * 1.7 + vec3(uTime * 0.01, 0.0, 0.0)) - 0.5) * 0.09 + (fbm3(q * 6.0) - 0.5) * 0.025;
    float l = lat + w;
    float b = sin(l * 22.0) * 0.6 + sin(l * 9.0 + 0.7) * 0.4;
    vec3 c = mix(vec3(0.5, 0.28, 0.16), vec3(0.9, 0.8, 0.64), smoothstep(-0.3, 0.5, b));
    c = mix(c, vec3(0.80, 0.62, 0.45), 0.25 * fbm3(q * 4.0));
    float lon = atan(ln.z, ln.x);
    vec2 gr = vec2((lon - 0.5) * 1.1, (lat + 0.37) * 3.2);
    float rr = length(gr * vec2(0.55, 1.0));
    float sw = fbm3(vec3(gr * 6.0 + rr * 4.0, 2.0));
    c = mix(c, mix(vec3(0.72, 0.30, 0.18), vec3(0.88, 0.5, 0.35), sw), smoothstep(0.17, 0.11, rr));
    c = mix(c, vec3(0.95, 0.9, 0.8), smoothstep(0.03, 0.0, abs(rr - 0.18)) * 0.5);
    c = mix(c, vec3(0.55, 0.5, 0.48), smoothstep(0.8, 0.97, abs(lat)));
    return c;
  }
  if (uType < 3.5) {   // the Sun: granulation, dark spots, limb darkening (all emitted light)
    vec4 g = cells(ln * 70.0 + vec3(uTime * 0.05));
    float gr = smoothstep(0.0, 0.25, g.y - g.x);
    float sp = smoothstep(0.62, 0.7, fbm3(ln * 3.5 + 11.0)) * smoothstep(0.45, 0.1, abs(lat));
    vec3 c = vec3(1.0, 0.62, 0.22) * (0.75 + 0.35 * gr + 0.25 * fbm3(ln * 14.0));
    c *= 1.0 - 0.8 * sp;
    return c;
  }
  if (uType < 4.5) {   // Earth: NASA's maps
    vec2 uv = uvOf(ln);
    return texture2D(uDay, uv).rgb;
  }
  // the Moon: grey highlands, dark maria, craters
  float mar = smoothstep(0.52, 0.62, fbm3(ln * 1.6 + 3.0));
  vec3 c = mix(vec3(0.58, 0.56, 0.53), vec3(0.24, 0.24, 0.25), mar);
  vec4 k = cells(ln * 9.0);
  float rim = smoothstep(0.08, 0.0, abs(k.x - 0.32 * (0.4 + 0.6 * k.z))) * step(k.w, 0.55);
  float pit = smoothstep(0.32 * (0.4 + 0.6 * k.z), 0.0, k.x) * step(k.w, 0.55);
  vec4 k2 = cells(ln * 31.0 + 5.0);
  float rim2 = smoothstep(0.07, 0.0, abs(k2.x - 0.3)) * step(k2.w, 0.4);
  c *= 1.0 - 0.25 * pit + 0.35 * rim + 0.2 * rim2;
  c *= 0.85 + 0.3 * fbm3(ln * 40.0);
  return c;
}
// the inside, where the wall slices through (r: distance from the centre, 0..1)
vec3 inside(float r, vec3 q) {
  float n = fbm3(q * 6.0 + vec3(uTime * 0.2));
  vec3 c;
  if (uType < 0.5) c = mix(vec3(1.4, 0.7, 0.3), mix(vec3(0.5, 0.95, 1.4), vec3(0.15, 0.35, 0.9), smoothstep(0.8, 0.95, r)), smoothstep(0.24, 0.3, r));
  else if (uType < 2.5) c = mix(vec3(1.6, 0.9, 0.45), mix(vec3(0.75, 0.8, 1.2), vec3(1.0, 0.7, 0.35), smoothstep(0.72, 0.8, r)), smoothstep(0.15, 0.2, r));
  else if (uType < 3.5) c = mix(vec3(4.0, 3.6, 3.0), mix(vec3(3.0, 2.0, 0.8), vec3(2.2, 0.9, 0.25) * (0.7 + 0.6 * n), smoothstep(0.68, 0.72, r)), smoothstep(0.2, 0.3, r));
  else if (uType < 4.5) {   // inner core, outer core, mantle, crust
    c = vec3(3.0, 2.6, 1.6);
    c = mix(c, vec3(2.4, 1.0, 0.25) * (0.85 + 0.3 * n), smoothstep(0.18, 0.2, r));
    c = mix(c, mix(vec3(1.3, 0.35, 0.08), vec3(0.7, 0.18, 0.05), smoothstep(0.55, 0.98, r)) * (0.8 + 0.4 * n), smoothstep(0.537, 0.555, r));
    c = mix(c, vec3(0.35, 0.3, 0.28), smoothstep(0.985, 0.992, r));
  } else c = mix(vec3(1.2, 0.45, 0.15), vec3(0.45, 0.4, 0.38) * (0.7 + 0.5 * n), smoothstep(0.2, 0.26, r));
  // glowing where it is being erased: the rim of the slice
  c += EDGE * smoothstep(0.93, 1.0, r) * 1.2;
  return c * (0.85 + 0.3 * n);
}
void main() {
  vec3 p = vW;
  float s = wallS(p);
  if (s < 0.0) discard;
  vec3 V = normalize(cameraPosition - p);
  if (!gl_FrontFacing) {
    // the front was cut away: the line of sight meets the wall first; inside the body it shows the slice
    vec3 d = -V;
    float t = wallHit(cameraPosition, d);
    if (t < 0.0) discard;
    vec3 q = cameraPosition + d * t;
    float r = length(q);
    gl_FragColor = vec4(r < 1.0 ? inside(r, q) : voidLook(q, d, uScale), 1.0);
    return;
  }
  vec3 n = normalize(p);
  vec3 ln = uTilt * n;   // body-fixed coordinates (bands follow the body's own equator)
  float ndl = dot(n, uL);
  vec3 base = surface(n, ln, ndl);
  vec3 col;
  float mu = max(dot(n, V), 0.0);
  if (uType > 2.5 && uType < 3.5) {
    col = base * (0.3 + 0.7 * pow(mu, 0.6)) * 1.0;
  } else if (uType > 3.5 && uType < 4.5) {
    vec2 uv = uvOf(ln);
    float lights = texture2D(uNight, uv).r;
    float cloud = texture2D(uClouds, uv + vec2(uTime * 0.0004, 0.0)).r;
    col = base * (0.01 + 1.05 * max(ndl, 0.0));
    float night = 1.0 - smoothstep(-0.1, 0.06, ndl);
    col += vec3(1.0, 0.62, 0.3) * pow(lights, 1.5) * 2.2 * night;
    col = mix(col, vec3(1.0) * (0.01 + 1.0 * max(ndl + 0.04, 0.0)), smoothstep(0.2, 0.85, cloud) * 0.85);
    col += vec3(0.25, 0.45, 1.0) * pow(1.0 - mu, 3.0) * smoothstep(-0.2, 0.4, ndl) * 0.9;
    col += vec3(1.0, 0.5, 0.2) * exp(-pow(ndl / 0.07, 2.0)) * 0.08;
  } else {
    float lim = 0.55 + 0.45 * pow(mu, 0.4);
    float lit = smoothstep(-0.05, 0.25, ndl) * (0.25 + 0.75 * max(ndl, 0.0));
    if (uType > 4.5) lit = max(ndl, 0.0) * (0.6 + 0.4 * mu) * 1.15;
    col = base * lit * lim * 1.1;
    if (uType < 2.5) col += mix(vec3(0.3, 0.5, 1.0), vec3(0.9, 0.8, 0.6), step(0.5, uType)) * pow(1.0 - mu, 4.0) * smoothstep(-0.1, 0.5, ndl) * 0.35;
    // Saturn: the rings' shadow on the planet
    if (uType > 0.5 && uType < 1.5) {
      float dn = dot(uL, uRing);
      if (abs(dn) > 1e-3) {
        float tr = -dot(p, uRing) / dn;
        if (tr > 0.0) { vec3 h = p + uL * tr; col *= 1.0 - 0.85 * ringOpacity(length(h)); }
      }
    }
  }
  // the cut: a glowing seam where the wall is eating it, and a soft glow spilling ahead of it
  float w = 0.012 + 0.004 * length(cameraPosition - p);
  float jag = (fbm3(p * 30.0 + vec3(uTime * 0.6)) - 0.5) * w * 2.5;
  col += EDGE * (exp(-max(s + jag, 0.0) / w) * 3.5 + exp(-s / (w * 12.0)) * 0.35);
  gl_FragColor = vec4(col, 1.0);
}`;

const BODY_VERT = /* glsl */ `
varying vec3 vW;
void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;

export function makeSpace() {
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
  const u = {
    uMode: { value: 0 }, uN: { value: new THREE.Vector3(0, 1, 0) }, uW: { value: -100 }, uBC: { value: new THREE.Vector3() }, uBR: { value: 1 },
    uTime: { value: 0 }, uType: { value: 0 }, uL: { value: new THREE.Vector3(0, 1, 0) }, uTilt: { value: new THREE.Matrix3() }, uScale: { value: 1 },
    uDay: { value: load('textures/earth_day.jpg', true) }, uNight: { value: load('textures/earth_night.jpg', false) }, uClouds: { value: load('textures/earth_clouds.jpg', false) },
    uRing: { value: new THREE.Vector3(0, 1, 0) },
  };
  const ready = Promise.all(waits);

  // ---- the sky: stars and the Milky Way; where the line of sight meets the wall, the void instead ----
  const sky = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 32), new THREE.ShaderMaterial({
    uniforms: u, side: THREE.BackSide, depthWrite: false, depthTest: false,
    vertexShader: `varying vec3 vD; void main(){ vD = position; vec4 w = modelMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * viewMatrix * w; gl_Position.z = gl_Position.w * 0.99999; }`,
    fragmentShader: /* glsl */ `${WALL_GLSL}
      uniform float uScale; varying vec3 vD;
      void main() {
        vec3 d = normalize(vD);
        float t = wallHit(cameraPosition, d);
        if (t > 0.0) { gl_FragColor = vec4(voidLook(cameraPosition + d * t, d, uScale), 1.0); return; }
        // the Milky Way: a band of soft light and dust lanes across the sky
        vec3 gp = normalize(vec3(0.35, 0.82, -0.45));
        float b = dot(d, gp);
        float band = exp(-b * b * 22.0);
        float dust = fbm3(d * 7.0 + 2.0);
        vec3 c = vec3(0.004, 0.005, 0.009) + vec3(0.09, 0.08, 0.07) * band * (0.5 + 0.8 * fbm3(d * 3.0)) * (1.0 - 0.8 * smoothstep(0.45, 0.65, dust) * exp(-b * b * 60.0));
        gl_FragColor = vec4(c, 1.0);
      }`,
  }));
  sky.renderOrder = -10; sky.frustumCulled = false;
  scene.add(sky);
  // stars: points, each hidden once the wall is between you and it
  {
    const n = 7000, p = new Float32Array(n * 3), c = new Float32Array(n * 3);
    let sd = 11;
    const r = () => ((sd = (sd * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < n; i++) {
      const z = r() * 2 - 1, a = r() * 6.283, q = Math.sqrt(1 - z * z);
      p.set([Math.cos(a) * q, z, Math.sin(a) * q], i * 3);
      const b = Math.pow(r(), 5) * 2.2 + 0.12, w = r();
      c.set([b * (0.9 + 0.2 * w), b * 0.95, b * (1.1 - 0.25 * w)], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    const stars = new THREE.Points(g, new THREE.ShaderMaterial({
      uniforms: u, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `${WALL_GLSL}
        attribute vec3 color; varying vec3 vC;
        void main() {
          vec3 d = normalize(position);
          vC = wallHit(cameraPosition, d) > 0.0 ? vec3(0.0) : color;
          vec4 w = vec4(cameraPosition + d * 1e4, 1.0);
          gl_Position = projectionMatrix * viewMatrix * w; gl_Position.z = gl_Position.w * 0.99998;
          gl_PointSize = 1.6 + 1.6 * min(dot(color, vec3(0.33)), 1.5);
        }`,
      fragmentShader: `varying vec3 vC; void main(){ float r = length(gl_PointCoord - 0.5); gl_FragColor = vec4(vC * smoothstep(0.5, 0.15, r), 1.0); }`,
    }));
    stars.renderOrder = -9; stars.frustumCulled = false;
    scene.add(stars);
  }

  // ---- the body ----
  const bodyMat = new THREE.ShaderMaterial({ uniforms: u, vertexShader: BODY_VERT, fragmentShader: BODY_FRAG, side: THREE.DoubleSide });
  const body = new THREE.Mesh(new THREE.SphereGeometry(1, 384, 192), bodyMat);
  body.frustumCulled = false;
  scene.add(body);

  // ---- Saturn's rings ----
  const ringMat = new THREE.ShaderMaterial({
    uniforms: u, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    vertexShader: BODY_VERT,
    fragmentShader: /* glsl */ `${WALL_GLSL}
      uniform vec3 uL; uniform vec3 uRing; varying vec3 vW;
      float ringOpacity(float r) {
        float o = 0.0;
        o += 0.25 * smoothstep(1.235, 1.26, r) * (1.0 - smoothstep(1.51, 1.527, r));
        o += 0.92 * smoothstep(1.52, 1.54, r) * (1.0 - smoothstep(1.94, 1.951, r));
        o += 0.62 * smoothstep(2.025, 2.035, r) * (1.0 - smoothstep(2.26, 2.27, r)) * (1.0 - 0.9 * smoothstep(0.004, 0.0, abs(r - 2.214)));
        o *= 0.8 + 0.2 * sin(r * 260.0) * sin(r * 77.0);
        return o;
      }
      void main() {
        vec3 p = vW;
        float s = wallS(p);
        if (s < 0.0) discard;
        float r = length(p);
        float o = ringOpacity(r);
        // in Saturn's shadow?
        float b = dot(p, uL), c = dot(p, p) - 1.0, h = b * b - c;
        float shad = (b < 0.0 && h > 0.0) ? 0.08 : 1.0;
        vec3 col = mix(vec3(0.72, 0.62, 0.48), vec3(0.92, 0.86, 0.74), smoothstep(1.5, 2.0, r)) * (0.9 + 0.2 * sin(r * 140.0));
        col *= (0.35 + 0.75 * abs(dot(uL, uRing))) * shad * 1.25;
        float w = 0.012 + 0.004 * length(cameraPosition - p);
        float e = exp(-s / w);
        col += EDGE * e * 4.0;
        gl_FragColor = vec4(col * o + EDGE * e * 0.6 * (1.0 - o), max(o, e * 0.5));
      }`,
  });
  const rings = new THREE.Mesh(new THREE.RingGeometry(1.2, 2.3, 512, 4).rotateX(-Math.PI / 2), ringMat);
  rings.frustumCulled = false; rings.renderOrder = 2;
  scene.add(rings);

  // ---- the Sun's corona and glow: a camera-facing sheet, cut by the wall like everything else ----
  const corona = new THREE.Mesh(new THREE.PlaneGeometry(12, 12), new THREE.ShaderMaterial({
    uniforms: u, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `varying vec3 vW; varying vec2 vP; void main(){ vP = position.xy; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */ `${WALL_GLSL}
      varying vec3 vW; varying vec2 vP;
      void main() {
        float r = length(vP);
        if (r < 0.98) discard;
        float s = wallS(vW);
        if (s < 0.0) discard;
        float a = atan(vP.y, vP.x);
        float str = 0.6 + 0.8 * fbm3(vec3(a * 3.0, r * 0.4 - uTime * 0.05, 1.0));
        float k = pow(r, -3.5) * str * 1.2 + pow(r, -8.0) * 2.0;
        k *= smoothstep(6.0, 3.0, r);
        vec3 c = vec3(1.0, 0.62, 0.3) * k * 0.9 + EDGE * exp(-s / 0.05) * 1.5 * smoothstep(5.0, 1.5, r);
        gl_FragColor = vec4(c, 1.0);
      }`,
  }));
  corona.frustumCulled = false; corona.renderOrder = 3;
  scene.add(corona);

  // ---- a thin bright haze over the gas giants and Earth (cut by the wall) ----
  const atmo = new THREE.Mesh(new THREE.SphereGeometry(1.025, 192, 96), new THREE.ShaderMaterial({
    uniforms: { ...u, uTint: { value: new THREE.Color(0.3, 0.55, 1.0) }, uAmt: { value: 1 } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.BackSide,
    vertexShader: BODY_VERT,
    fragmentShader: /* glsl */ `${WALL_GLSL}
      uniform vec3 uL; uniform vec3 uTint; uniform float uAmt; varying vec3 vW;
      void main(){
        if (wallS(vW) < 0.0) discard;
        vec3 V = normalize(cameraPosition - vW); vec3 n = normalize(vW);
        float rim = pow(1.0 - abs(dot(n, V)), 3.0);
        float lit = smoothstep(-0.35, 0.4, dot(n, uL));
        gl_FragColor = vec4(uTint * rim * lit * 1.4 * uAmt, 1.0);
      }`,
  }));
  atmo.frustumCulled = false; atmo.renderOrder = 4;
  scene.add(atmo);

  return { scene, u, ready, body, rings, corona, atmo, sky };
}

// ---- the shots: where everything is, per body ----
// N: the way the wall travels (from beyond the Sun toward Earth). L: toward the Sun from the body.
// For the outer planets the Sun lies ahead of them (L = N): the night side is eaten first. For the Moon and Earth
// the wall comes from the Sun's side (L = -N): the sunlit side is eaten first. (unit: the body's radius)
const v3 = (x, y, z) => new THREE.Vector3(x, y, z).normalize();
export const BODIES = {
  neptune: { type: 0, km: R.nep, T: T.nep, sphere: 25, N: v3(0.45, 0.82, 0.2), L: v3(0.62, 0.7, 0.35), tilt: [0.5, 0.3, 0.2], atmo: [0.12, 0.3, 0.8] },
  saturn: { type: 1, km: R.sat, T: T.sat, N: v3(0.5, 0.8, 0.15), L: v3(0.62, 0.72, 0.3), tilt: [0.55, 0.0, 0.35], atmo: [0.9, 0.75, 0.5], ring: true },
  jupiter: { type: 2, km: R.jup, T: T.jup, N: v3(0.4, 0.85, 0.2), L: v3(0.6, 0.72, 0.36), tilt: [0.08, 0.6, 0.05], atmo: [0.9, 0.75, 0.55] },
  sun: { type: 3, km: R.sun, T: T.sun, N: v3(0.35, 0.9, 0.15), L: v3(0, 1, 0), tilt: [0.1, 0.0, 0.1], corona: true },
  moon: { type: 5, km: R.moon, T: T.moon, N: v3(-0.45, -0.85, -0.25), L: v3(0.45, 0.85, 0.25), tilt: [0, 0, 0] },
  earth: { type: 4, km: R.earth, T: T.earth, N: null, L: null, tilt: [0, 0, 0], atmo: [0.3, 0.55, 1.0] },
};
// how far the wall has come past the body's centre (body radii) at tau
export const wallPos = (b, tau) => (b.T - tau) * C_KM / b.km;
