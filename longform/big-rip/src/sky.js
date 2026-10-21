// The sky, from tonight to the end.
//   Night: a deep blue-black sky with the city's orange glow on the horizon; thousands of stars; the Milky Way
//   (in galactic coordinates: a bright warm core low ahead, star clouds and dark dust lanes along the band).
//   The galaxy comes apart (uRip): its stars stream away from the plane and the band frays into filaments,
//   spreading thinner and fainter; then every star slides away, reddens and winks out (uStars, uRed).
//   Planets: Jupiter, Saturn, Mars as points; the Moon a disk with maria, lit as a waxing gibbous, that shrinks to a
//   dot (uMoonR); satellites crawling over and drifting off. Day: the stage frames are taken at 9 am, the Sun a disk
//   with its glare; as Earth drifts away the Sun shrinks (uSunR) and the whole sky dims (uDayI) to black.
import * as THREE from 'three';
import { SKY } from './layout.js';

const vert = /* glsl */ `
varying vec3 vDir;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vDir = wp.xyz - cameraPosition;
  gl_Position = projectionMatrix * viewMatrix * wp;
  gl_Position.z = gl_Position.w * 0.99999;
}`;

const frag = /* glsl */ `
precision highp float;
varying vec3 vDir;
uniform float uPx; uniform float uTime;
uniform float uDay; uniform float uDayI; uniform vec3 uSunDir; uniform float uSunR; uniform float uSunI;
uniform vec3 uGC; uniform vec3 uGP; uniform float uMW; uniform float uRip; uniform float uStars; uniform float uRed;
uniform vec3 uJup; uniform float uJupI; uniform vec3 uSat; uniform float uSatI; uniform vec3 uMars; uniform float uMarsI;
uniform vec3 uMoon; uniform float uMoonR; uniform float uMoonI;
uniform float uSats; uniform float uGlow; uniform float uAir; uniform float uLapse;
float hash13(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float n2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(hash12(i), hash12(i+vec2(1,0)), f.x), mix(hash12(i+vec2(0,1)), hash12(i+vec2(1,1)), f.x), f.y); }
float fbm2(vec2 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 6; i++){ s += a * n2(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; } return s; }
float n3(vec3 p) { vec3 i = floor(p); vec3 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash13(i), hash13(i + vec3(1,0,0)), f.x), mix(hash13(i + vec3(0,1,0)), hash13(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(hash13(i + vec3(0,0,1)), hash13(i + vec3(1,0,1)), f.x), mix(hash13(i + vec3(0,1,1)), hash13(i + vec3(1,1,1)), f.x), f.y), f.z); }

// a field of point stars on a grid of cells in 3D direction space; k: cells per unit, rare: share of empty cells
vec3 starField(vec3 v, float k, float rare, float gain, float cull) {
  vec3 sp = v * k;
  vec3 ci = floor(sp);
  float st = hash13(ci);
  if (st < rare) return vec3(0.0);
  float h2 = hash13(ci + 17.3);
  if (h2 < cull) return vec3(0.0);                  // winked out
  vec3 cp = ci + 0.5 + (vec3(hash13(ci + 1.7), hash13(ci + 4.1), hash13(ci + 9.3)) - 0.5) * 0.7;
  float d = length(sp - cp) / k;                      // radians
  float b = pow((st - rare) / (1.0 - rare), 4.0) * gain;
  float s = max(uPx * 0.75, 1e-6);
  float tc = hash13(ci + 5.5);
  vec3 col = tc < 0.2 ? vec3(1.0, 0.78, 0.55) : tc < 0.35 ? vec3(0.75, 0.85, 1.0) : vec3(1.0, 0.96, 0.9);
  return col * b * exp(-d * d / (s * s));
}

void main() {
  vec3 v = normalize(vDir);
  float h = clamp(v.y, 0.0, 1.0);
  float below = smoothstep(0.0, -0.04, v.y);

  // ---- night sky ----
  vec3 c = mix(vec3(0.016, 0.022, 0.05), vec3(0.003, 0.005, 0.016), smoothstep(0.0, 0.6, h));
  // the city's glow on the horizon, warmer toward downtown (ahead)
  float ahead = max(-v.z, 0.0);
  c += vec3(0.32, 0.17, 0.08) * exp(-h * 10.0) * (0.45 + 0.55 * ahead) * uGlow;
  c += vec3(0.08, 0.06, 0.07) * exp(-h * 3.0) * uGlow;
  float clearSky = 1.0 - 0.6 * exp(-h * 6.0) * uGlow;   // the haze low down hides the faint stars

  // ---- the Milky Way, in galactic coordinates ----
  vec3 X = uGC, Y = normalize(cross(uGP, uGC));
  float b = asin(clamp(dot(v, uGP), -1.0, 1.0));
  float l = atan(dot(v, Y), dot(v, X));
  {
    float rip = uRip;
    float sb = 1.0 + rip * 5.0;                       // the band spreads (its stars stream away from the plane)
    float bs = b / sb;                                // where this point's light came from
    float ls = l - rip * 1.1 * b;                     // and it shears as it unwinds
    float sig = 0.11;
    float prof = exp(-bs * bs / (sig * sig));
    float coreL = exp(-ls * ls / 0.55);
    float bulge = exp(-(ls * ls + bs * bs * 2.6) / 0.035);
    // star clouds: billowing structure along the band; streaking into filaments as it frays
    vec2 q = vec2(ls * 7.0, bs * 7.0);
    vec2 qs = vec2(ls * 11.0, bs * 11.0 / (1.0 + rip * 6.0) - sign(b) * rip * 3.0);
    float clouds = fbm2(q + 3.0) ;
    float fil = fbm2(vec2(qs.x * 2.5, qs.y * 0.6) + 11.0);
    float cl = mix(clouds, fil, smoothstep(0.0, 0.6, rip) * 0.7);
    // dark dust lanes: the Great Rift along the middle, ragged
    float dust = smoothstep(0.42, 0.62, fbm2(q * 1.6 + vec2(7.0, 2.0))) * exp(-pow((bs - 0.012 * sin(ls * 3.0)) / 0.045, 2.0));
    dust *= 1.0 - 0.7 * rip;
    float I = prof * (0.35 + 0.65 * coreL) * (0.3 + 1.2 * cl * cl) + bulge * 0.9 * (0.7 + 0.6 * clouds);
    I *= 1.0 - 0.85 * dust;
    I /= sb;                                           // the same light spread over a wider strip
    vec3 mwc = mix(vec3(0.62, 0.7, 0.95), vec3(1.0, 0.8, 0.55), clamp(coreL * 0.7 + bulge, 0.0, 1.0));
    mwc = mix(mwc, mwc * vec3(1.0, 0.5, 0.32), uRed);
    c += mwc * I * 0.42 * uMW * clearSky * (1.0 - uDay);
    // the band's own stars (dense near the plane), streaming out with it
    {
      // cells in (ls, bs) space so the stars ride the flow; centre mapped back to the sky to keep them points
      vec2 g = vec2(ls, bs) * 260.0;
      vec2 gi = floor(g);
      float st = hash12(gi);
      float dens = 0.93 - 0.2 * prof * (0.5 + cl);
      if (st > dens && hash12(gi + 7.7) > (1.0 - uStars)) {
        vec2 cc = (gi + 0.5 + (vec2(hash12(gi + 1.3), hash12(gi + 2.9)) - 0.5) * 0.7) / 260.0;
        float cb = cc.y * sb;                          // back to the sky
        float cl2 = cc.x + rip * 1.1 * cb;
        float d = length(vec2((l - cl2) * cos(b), b - cb));
        float s = max(uPx * 0.75, 1e-6);
        float br = pow((st - dens) / (1.0 - dens), 4.0) * 2.0 * (1.0 / (1.0 + rip * 1.5));
        vec3 sc = hash12(gi + 3.3) < 0.3 ? vec3(1.0, 0.8, 0.6) : vec3(0.85, 0.9, 1.0);
        sc = mix(sc, sc * vec3(1.0, 0.45, 0.25), uRed);
        c += sc * br * exp(-d * d / (s * s)) * clearSky * (1.0 - uDay) * (1.0 - 0.6 * uRed);
      }
    }
  }

  // ---- the background stars: they wink out one by one, redder and dimmer first ----
  {
    float cull = 1.0 - uStars;
    vec3 st = starField(v, 230.0, 0.975, 2.6, cull) + starField(v, 520.0, 0.988, 0.7, cull) + starField(v, 90.0, 0.982, 16.0, cull * 0.95);
    st = mix(st, st * vec3(1.0, 0.42, 0.22), uRed) * (1.0 - 0.65 * uRed);
    c += st * clearSky * (1.0 - uDay) * smoothstep(0.0, 0.06, v.y);
  }

  // ---- day: the sky at 9 am, dimming as the Sun shrinks ----
  {
    float sd = max(dot(v, uSunDir), 0.0);
    vec3 day = mix(vec3(0.66, 0.77, 0.93), vec3(0.2, 0.38, 0.78), smoothstep(0.0, 0.55, h));
    day += vec3(0.5, 0.42, 0.3) * pow(sd, 8.0) * 0.6;
    day += vec3(1.0, 0.9, 0.75) * pow(sd, 120.0) * 0.8;
    // dim: the sky is just scattered sunlight; as it fades it goes deep blue, then black
    vec3 dim = day * uDayI;
    dim = mix(dim, dim * vec3(0.6, 0.75, 1.25), (1.0 - uDayI) * 0.6);
    c = mix(c, dim + c * (1.0 - uDayI) * 0.2, uDay);
    // the Sun: a disk with limb darkening and glare; a star-like point once it's small
    float d = acos(clamp(dot(v, uSunDir), -1.0, 1.0));
    float R = max(uSunR, uPx * 0.6);
    float disk = 1.0 - smoothstep(R - uPx, R + uPx, d);
    float mu = clamp(1.0 - d / R, 0.0, 1.0);
    vec3 sunC = vec3(1.0, 0.93, 0.82) * (0.55 + 0.45 * sqrt(mu));
    float pt = clamp(uSunR / R, 0.0, 1.0);           // a point carries all the light it can
    c = mix(c, sunC * 30.0 * uSunI / max(pt * pt, 0.02) * 0.05 + sunC * 6.0, disk * uDay);
    c += vec3(1.0, 0.85, 0.65) * (exp(-max(d - R, 0.0) * 40.0) * 0.6 + exp(-max(d - R, 0.0) * 300.0) * 1.5) * uSunI * uDay;
  }

  // ---- planets: bright points with a soft halo ----
  {
    float s = max(uPx * 0.9, 1e-6);
    float dj = acos(clamp(dot(v, uJup), -1.0, 1.0));
    float ds = acos(clamp(dot(v, uSat), -1.0, 1.0));
    float dm = acos(clamp(dot(v, uMars), -1.0, 1.0));
    vec3 P = vec3(0.0);
    P += vec3(1.0, 0.95, 0.85) * uJupI * (exp(-dj * dj / (s * s)) * 14.0 + exp(-dj / (s * 4.0)) * 0.5);
    P += vec3(1.0, 0.9, 0.68) * uSatI * (exp(-ds * ds / (s * s)) * 5.0 + exp(-ds / (s * 3.0)) * 0.2);
    P += vec3(1.0, 0.55, 0.32) * uMarsI * (exp(-dm * dm / (s * s)) * 6.0 + exp(-dm / (s * 3.0)) * 0.25);
    c += P * (1.0 - uDay) * (0.5 + 0.5 * clearSky);
  }

  // ---- the Moon: a waxing gibbous with maria; shrinks to a dot ----
  if (uMoonI > 0.0) {
    vec3 m = uMoon;
    vec3 mx = normalize(cross(vec3(0.0, 1.0, 0.0), m)), my = cross(m, mx);
    vec2 q = vec2(dot(v, mx), dot(v, my));
    float R = max(uMoonR, uPx * 1.1);
    float d = length(q);
    float ang = acos(clamp(dot(v, m), -1.0, 1.0));
    if (dot(v, m) > 0.0) {
      vec2 u = q / R;
      float r2 = dot(u, u);
      float disk = 1.0 - smoothstep(1.0 - 1.5 * uPx / R, 1.0 + 1.5 * uPx / R, sqrt(r2));
      vec3 n = vec3(u, sqrt(max(1.0 - r2, 0.0)));
      vec3 L = normalize(vec3(-0.75, -0.25, 0.55));     // lit from the lower left (the Sun below the horizon)
      float lit = smoothstep(-0.05, 0.12, dot(n, L));
      float maria = fbm2(u * 2.2 + 4.0);
      float alb = mix(0.55, 1.0, smoothstep(0.42, 0.6, maria)) * (0.85 + 0.3 * fbm2(u * 9.0));
      float pt = clamp(uMoonR / R, 0.0, 1.0);
      vec3 mc = vec3(1.0, 0.97, 0.9) * alb * lit * 2.2;
      // a dot: just its light, like a bright star (even 400x further away it would still outshine most stars)
      mc = mix(vec3(1.0, 0.97, 0.9) * 2.2 * 0.7 * clamp(pow(pt, 0.35), 0.3, 1.0), mc, pt);
      c = mix(c, mc * uMoonI + c * 0.2, disk * uMoonI * (1.0 - uDay));
      // once it is a dot: a small bright star-like core and halo, so the dot reads on screen
      c += vec3(1.0, 0.97, 0.92) * (exp(-ang / (uPx * 0.9)) * 1.6 + exp(-ang / (uPx * 3.0)) * 0.25) * uMoonI * (1.0 - pt) * (1.0 - uDay);
      // its glow in the air (fades with its size)
      c += vec3(0.6, 0.65, 0.75) * exp(-ang / max(uMoonR * 4.0, 1e-4)) * 0.12 * uMoonI * pt * (1.0 - uDay) * (1.0 - uAir);
    }
  }

  // ---- satellites: specks crawling over, then drifting off one after another ----
  if (uSats > 0.0) {
    float s = max(uPx * 0.8, 1e-6);
    for (int i = 0; i < 24; i++) {
      float fi = float(i);
      float a0 = hash12(vec2(fi, 1.0)) * 6.283, inc = hash12(vec2(fi, 2.0)) * 1.4 - 0.7;
      float sp = 0.004 + 0.004 * hash12(vec2(fi, 3.0));
      float gone = hash12(vec2(fi, 4.0));
      float a = a0 + uTime * sp * 6.0;
      vec3 axis = normalize(vec3(sin(inc), cos(inc) * 0.3, cos(inc)));
      vec3 p0 = normalize(cross(axis, vec3(0.0, 1.0, 0.1)));
      vec3 p1 = cross(axis, p0);
      vec3 dir = normalize(p0 * cos(a) + p1 * sin(a));
      if (dir.y < 0.1) continue;
      float vis = smoothstep(gone - 0.15, gone, uSats) * (1.0 - smoothstep(gone, gone + 0.1, uSats * 1.0 - 0.0)) ;
      vis = 1.0 - smoothstep(gone * 0.9, gone * 0.9 + 0.08, uSats);
      float dd = acos(clamp(dot(v, dir), -1.0, 1.0));
      c += vec3(0.9, 0.92, 1.0) * exp(-dd * dd / (s * s)) * 1.6 * vis;
    }
  }

  // the air leaving: no more glow or haze, just black
  c = mix(c, c * 0.25, uAir);
  c = mix(c, vec3(0.012, 0.012, 0.014) * (1.0 - uAir), below * (1.0 - uDay));
  gl_FragColor = vec4(clamp(c, 0.0, 60.0), 1.0);
}`;

export function makeSky() {
  const V = (a) => ({ value: new THREE.Vector3(...a) });
  const uniforms = {
    uPx: { value: 0.0006 }, uTime: { value: 0 },
    uDay: { value: 0 }, uDayI: { value: 1 }, uSunDir: V(SKY.sun), uSunR: { value: 0.00465 }, uSunI: { value: 1 },
    uGC: V(SKY.gc), uGP: V(SKY.gpole), uMW: { value: 1 }, uRip: { value: 0 }, uStars: { value: 1 }, uRed: { value: 0 },
    uJup: V(SKY.jupiter), uJupI: { value: 1 }, uSat: V(SKY.saturn), uSatI: { value: 1 }, uMars: V(SKY.mars), uMarsI: { value: 1 },
    uMoon: V(SKY.moon), uMoonR: { value: 0.0045 }, uMoonI: { value: 1 },
    uSats: { value: 0 }, uGlow: { value: 1 }, uAir: { value: 0 }, uLapse: { value: 0 },
  };
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1000, 64, 32), new THREE.ShaderMaterial({ uniforms, vertexShader: vert, fragmentShader: frag, side: THREE.BackSide, depthWrite: false, depthTest: false }));
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;
  return { mesh, uniforms };
}
