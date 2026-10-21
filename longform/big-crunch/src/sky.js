// The sky over the bay, from tonight to the end.
//   Dusk: the Short's sunset sky (gold, then twilight), a few clouds. Night: deep blue-black with the city's glow
//   low on the right, thousands of stars and the Milky Way (in galactic coordinates: star clouds, dust lanes).
//   Andromeda (uAnd*): a tilted spiral that swells night after night until it fills half the sky; it crashes through
//   the Milky Way (uCollide: both are pulled into tidal tails and lit up with new stars), and the two settle into one
//   huge ball of stars (uBall). After the turnaround the far galaxies come back (uBack: bluer, bigger, more of them)
//   and crash together (uMerge: starlight in torn streams everywhere, no dark left between them).
//   The heat: the Big Bang's leftover light squeezed hot. From ~800 K the whole sky glows (uGlow: its colour and
//   brightness, seething), and from ~3,000 K it turns into a fog of fire that hides everything beyond (uFog).
//   The Sun: a disk (frames from the melt on are taken an hour before sunset); it loses its contrast as the sky gets
//   as hot as its surface (uSunC) and frays at the edge as it boils away (uSunFuzz).
import * as THREE from 'three';

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
uniform vec3 uSunDir; uniform float uSunR; uniform vec3 uSunCol; uniform float uSunI; uniform float uSunC; uniform float uSunFuzz;
uniform float uPx; uniform float uTime; uniform float uCloudCov; uniform vec2 uCloudPhase; uniform float uCityGlow;
uniform vec3 uGC; uniform vec3 uGP; uniform float uMW;
uniform vec3 uAnd; uniform vec3 uAndA; uniform vec3 uAndB; uniform float uAndR; uniform float uCollide; uniform float uBall;
uniform float uBack; uniform float uMerge; uniform vec3 uGlow; uniform float uFog; uniform float uSeethe;
float hash13(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float n2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(hash12(i), hash12(i+vec2(1,0)), f.x), mix(hash12(i+vec2(0,1)), hash12(i+vec2(1,1)), f.x), f.y); }
float fbm2(vec2 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 6; i++){ s += a * n2(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; } return s; }
float noise3(vec3 p) { vec3 i = floor(p); vec3 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash13(i), hash13(i + vec3(1,0,0)), f.x), mix(hash13(i + vec3(0,1,0)), hash13(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(hash13(i + vec3(0,0,1)), hash13(i + vec3(1,0,1)), f.x), mix(hash13(i + vec3(0,1,1)), hash13(i + vec3(1,1,1)), f.x), f.y), f.z); }
float fbm3(vec3 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * noise3(p); p = p * 2.03 + 7.1; a *= 0.5; } return s; }

// point stars on a grid of cells in direction space; k: cells per unit, rare: share of empty cells
vec3 starField(vec3 v, float k, float rare, float gain) {
  vec3 sp = v * k;
  vec3 ci = floor(sp);
  float st = hash13(ci);
  if (st < rare) return vec3(0.0);
  vec3 cp = ci + 0.5 + (vec3(hash13(ci + 1.7), hash13(ci + 4.1), hash13(ci + 9.3)) - 0.5) * 0.7;
  float d = length(sp - cp) / k;
  float b = pow((st - rare) / (1.0 - rare), 4.0) * gain;
  float s = max(uPx * 0.75, 1e-6);
  float tc = hash13(ci + 5.5);
  vec3 col = tc < 0.2 ? vec3(1.0, 0.78, 0.55) : tc < 0.35 ? vec3(0.75, 0.85, 1.0) : vec3(1.0, 0.96, 0.9);
  return col * b * exp(-d * d / (s * s));
}

void main() {
  vec3 v = normalize(vDir);
  float h = clamp(v.y, 0.0, 1.0);
  vec3 S = normalize(uSunDir);
  float e = degrees(asin(clamp(S.y, -1.0, 1.0)));
  vec3 sh = normalize(vec3(S.x, 0.0, S.z) + vec3(1e-4, 0.0, 0.0));
  float az = dot(normalize(vec3(v.x, 0.0, v.z) + vec3(1e-5, 0.0, 0.0)), sh) * 0.5 + 0.5;
  float sunSide = pow(az, 3.0);

  // ---- the sky's colour for the Sun's elevation (the Short's) ----
  vec3 day = mix(vec3(0.62, 0.74, 0.92), vec3(0.17, 0.34, 0.74), smoothstep(0.0, 0.6, h));
  day += vec3(0.25, 0.22, 0.15) * pow(az, 6.0) * (1.0 - smoothstep(0.0, 0.5, h));
  vec3 top = vec3(0.12, 0.24, 0.52);
  vec3 mid = mix(vec3(0.5, 0.28, 0.42), vec3(0.98, 0.45, 0.25), pow(az, 1.5));
  vec3 low = mix(vec3(0.9, 0.42, 0.2), vec3(1.15, 0.58, 0.22), sunSide);
  vec3 gold = mix(low, mid, smoothstep(0.0, 0.14, h));
  gold = mix(gold, top, smoothstep(0.1, 0.6, h));
  gold *= 0.8 + 0.35 * sunSide * (1.0 - smoothstep(0.0, 0.45, h));
  vec3 twi = mix(mix(vec3(0.95, 0.38, 0.16), vec3(0.55, 0.22, 0.32), 1.0 - sunSide) * 0.9, vec3(0.06, 0.1, 0.28), smoothstep(0.0, 0.35, h));
  twi = mix(twi, vec3(0.03, 0.05, 0.16), smoothstep(0.35, 0.9, h));
  vec3 nite = mix(vec3(0.02, 0.028, 0.06), vec3(0.004, 0.007, 0.02), smoothstep(0.0, 0.5, h));
  vec3 c;
  if (e > 8.0) c = mix(gold, day, smoothstep(8.0, 22.0, e));
  else if (e > -1.0) c = mix(twi * 1.15, gold, smoothstep(-1.0, 3.0, e));
  else if (e > -8.0) c = mix(nite + 0.25 * twi * smoothstep(-12.0, -2.0, e), twi * 1.15, smoothstep(-8.0, -1.0, e));
  else c = mix(nite, nite + 0.25 * twi, smoothstep(-14.0, -8.0, e));
  float night = 1.0 - smoothstep(-14.0, -4.0, e);
  // the city's glow low over the skyline (on the right) at night
  c += vec3(0.3, 0.16, 0.07) * exp(-h * 9.0) * smoothstep(-0.3, 0.6, v.x) * uCityGlow * night;
  float clearSky = (1.0 - 0.55 * exp(-h * 6.0) * uCityGlow) * night * smoothstep(-0.01, 0.05, v.y);

  // ---- clouds at dusk ----
  if (v.y > 0.0 && uCloudCov > 0.0) {
    float dist = 3000.0 / max(v.y, 0.03);
    vec2 p = v.xz * dist / 2600.0 + uCloudPhase;
    float n = fbm3(vec3(p * vec2(1.0, 0.55), 1.7));
    float cov = smoothstep(0.58, 0.76, n) * (1.0 - smoothstep(25000.0, 60000.0, dist)) * uCloudCov;
    float lit = fbm3(vec3(p * 3.0, 4.0));
    vec3 cg = mix(vec3(0.28, 0.16, 0.26), vec3(1.1, 0.48, 0.24), (0.3 + 0.7 * lit) * (0.45 + 0.6 * sunSide));
    vec3 cc = e > -1.0 ? cg : mix(vec3(0.02, 0.025, 0.05), cg * 0.6, smoothstep(-8.0, -1.0, e));
    c = mix(c, cc, cov * 0.9);
  }

  // everything in space below (stars, galaxies) is added as light
  vec3 sp = vec3(0.0);

  // ---- the Milky Way, in galactic coordinates; pulled apart by the crash, gone into the ball ----
  vec3 X = uGC, Y = normalize(cross(uGP, uGC));
  float b = asin(clamp(dot(v, uGP), -1.0, 1.0));
  float l = atan(dot(v, Y), dot(v, X));
  if (uMW > 0.001) {
    float col = uCollide * (1.0 - uBall);
    float warp = (fbm2(vec2(l * 1.3, uTime * 0.02)) - 0.5) * 0.5 * col;   // the plane bends and tears
    float bs = (b - warp) / (1.0 + 2.5 * col);
    float sig = 0.11;
    float prof = exp(-bs * bs / (sig * sig));
    float coreL = exp(-l * l / 0.55);
    float bulge = exp(-(l * l + bs * bs * 2.6) / 0.025) * 0.6;
    vec2 q = vec2(l * 7.0, bs * 7.0);
    float clouds = fbm2(q + 3.0);
    float dust = smoothstep(0.42, 0.62, fbm2(q * 1.6 + vec2(7.0, 2.0))) * exp(-pow((bs - 0.012 * sin(l * 3.0)) / 0.045, 2.0)) * (1.0 - 0.6 * col);
    float I = prof * (0.35 + 0.65 * coreL) * (0.3 + 1.2 * clouds * clouds) + bulge * 0.9 * (0.7 + 0.6 * clouds);
    I *= 1.0 - 0.85 * dust;
    I /= 1.0 + 1.5 * col;
    vec3 mwc = mix(vec3(0.62, 0.7, 0.95), vec3(1.0, 0.8, 0.55), clamp(coreL * 0.7 + bulge, 0.0, 1.0));
    // new stars lit by the crash: blue and pink knots along the band
    float knots = pow(fbm2(q * 2.3 + 17.0), 5.0) * 6.0 * col * prof;
    sp += (mwc * I * 0.24 + vec3(0.7, 0.75, 1.0) * knots * 0.25) * uMW * (1.0 + 0.8 * col);
  }

  // ---- Andromeda: a tilted spiral, swelling; then the crash, then one ball ----
  if (uAndR > 0.0) {
    float fr = dot(v, normalize(uAnd));
    if (fr > -0.2) {
      vec2 q = vec2(dot(v, uAndA), dot(v, uAndB) / 0.32) / uAndR;   // in its own disk (tilted 71°)
      float col = uCollide * (1.0 - uBall);
      // the crash: the disk is flung out into curving tidal tails
      vec2 tw = vec2(fbm2(q * 0.8 + 3.0) - 0.5, fbm2(q * 0.8 + 9.0) - 0.5);
      q += tw * 1.6 * col;
      q = mat2(cos(col * 0.6), -sin(col * 0.6), sin(col * 0.6), cos(col * 0.6)) * q;
      float r = length(q);
      float ang = atan(q.y, q.x);
      float arms = 0.55 + 0.45 * sin(ang * 2.0 - log(r + 0.02) * 4.5);
      float lanes = 1.0 - 0.55 * smoothstep(0.55, 0.85, fbm2(q * 6.0 + 4.0)) * exp(-pow((r - 0.42) / 0.14, 2.0)) * (1.0 - col);
      float bulgeA = exp(-r * r / 0.006) * 2.4 + exp(-r * r / 0.04) * 0.6;
      float disk = exp(-r / 0.22) * (0.5 + 0.9 * arms) * lanes;
      float grain = 0.75 + 0.5 * fbm2(q * 18.0);                // resolved into stars once it is huge
      vec3 ac = mix(vec3(0.7, 0.78, 1.0), vec3(1.0, 0.86, 0.62), clamp(bulgeA, 0.0, 1.0));
      float knots = pow(fbm2(q * 5.0 + 31.0), 4.0) * 5.0 * exp(-r / 0.5) * col;
      float A = (bulgeA + disk * grain) * step(0.0, fr) * (1.0 - uBall);
      // the surface brightness stays about the same as it grows (the same light over a bigger patch)
      sp += (ac * A * 0.55 + vec3(0.65, 0.75, 1.0) * knots * 0.3) * (0.6 + 0.6 * col);
    }
  }

  // ---- after the crash: one huge ball of stars, brightest toward its middle ----
  if (uBall > 0.0) {
    vec3 gc = normalize(uAnd + uGC * 0.6);
    float a = acos(clamp(dot(v, gc), -1.0, 1.0));
    float g = exp(-a * 1.6) * 0.5 + exp(-a * a / 0.05) * 0.9 + 0.05;
    vec3 bc = mix(vec3(1.0, 0.86, 0.66), vec3(0.85, 0.85, 0.95), smoothstep(0.0, 1.5, a));
    sp += bc * g * (0.75 + 0.5 * fbm3(v * 5.0)) * 0.3 * uBall;
  }

  // ---- the stars (the ones in the ball are part of the same sky) ----
  sp += starField(v, 230.0, 0.975, 2.6) + starField(v, 520.0, 0.988, 0.7) + starField(v, 90.0, 0.982, 14.0);

  // ---- the far galaxies coming back: small tilted spirals, bluer, bigger, more and more of them ----
  if (uBack > 0.0) {
    float nGal = 6.0 + 54.0 * uBack;
    for (int k = 0; k < 60; k++) {
      float fk = float(k);
      if (fk >= nGal) break;
      float h1 = fract(sin(fk * 12.9898) * 43758.5453), h2 = fract(sin(fk * 78.233) * 12345.678), h3 = fract(sin(fk * 39.425) * 24634.6345);
      vec3 gd = normalize(vec3(h1 * 2.0 - 1.0, 0.15 + 0.85 * h2, -0.2 - 0.9 * h3));
      vec3 a1 = normalize(cross(gd, vec3(0.3, 1.0, 0.1))), a2 = cross(gd, a1);
      float size = (0.01 + 0.012 * fract(fk * 0.37)) * (0.6 + 4.0 * uBack * uBack * (0.4 + 0.6 * h3)) * (1.0 + 1.5 * uMerge);
      vec2 q = vec2(dot(v, a1), dot(v, a2)) / size;
      float cs = cos(fk), sn = sin(fk); q = mat2(cs, -sn, sn, cs) * q; q.y *= 2.2;
      float r = length(q);
      if (r > 6.0) continue;
      float arms = 0.5 + 0.5 * sin(atan(q.y, q.x) * 2.0 - r * 3.5);
      float gl = (exp(-r * r * 3.0) * 1.2 + exp(-r * 1.6) * arms * 0.6) * step(0.0, dot(v, gd));
      float fade = clamp(nGal - fk, 0.0, 1.0);
      sp += vec3(0.55, 0.72, 1.0) * gl * 0.4 * fade * (0.5 + uBack) * (1.0 - 0.6 * uMerge);
    }
  }
  // ---- crashed together: starlight everywhere, in torn streams of stars (dark lanes between them) ----
  if (uMerge > 0.0) {
    float n = fbm3(v * 3.0 + vec3(uTime * 0.02, 0.0, 0.0));
    float n2 = fbm3(v * 9.0 - vec3(0.0, uTime * 0.03, 0.0));
    float streams = pow(n, 5.0) * 3.0 + 0.5 * pow(n2, 4.0);
    float grain = 0.45 + 0.9 * noise3(v * 260.0);                   // made of stars, not mist
    vec3 dense = starField(v, 380.0, 0.9, 3.0) + starField(v, 700.0, 0.85, 1.2);
    sp += uMerge * (vec3(0.7, 0.8, 1.0) * streams * grain * 0.5 + dense * (0.4 + 2.5 * streams) + vec3(0.04, 0.05, 0.08));
  }
  c += sp * clearSky;

  // ---- the heat: the whole sky glowing, seething; then a fog of fire that hides everything ----
  float gw = clamp(length(uGlow) * 2.0, 0.0, 1.0);
  float boil = fbm3(v * 4.0 + vec3(uTime * 0.25 * uSeethe, uTime * 0.17 * uSeethe, 0.0));
  vec3 glow = uGlow * (0.45 + 1.4 * boil * boil) * (0.85 + 0.3 * (1.0 - h));
  c = c * (1.0 - 0.85 * gw) + glow;
  float big = fbm3(v * 1.6 + vec3(uTime * 0.12 * uSeethe, 0.0, uTime * 0.08 * uSeethe));
  c = mix(c, uGlow * (0.45 + 1.1 * big * big + 0.35 * boil), uFog * 0.92);

  // ---- the Sun: a disk with its glare; it fades into a sky as hot as it is, fraying as it boils away ----
  {
    float d = acos(clamp(dot(v, S), -1.0, 1.0));
    float R = uSunR * (1.0 + 0.8 * uSunFuzz);
    float soft = uPx * 1.5 + R * 0.5 * uSunFuzz;
    float fray = (fbm3(v * 160.0 + vec3(uTime * 0.4)) - 0.5) * R * 0.9 * uSunFuzz;
    float disk = 1.0 - smoothstep(R - soft, R + soft, d + fray);
    c = mix(c, uSunCol * uSunI, disk * uSunC);
    float g = exp(-max(d - R, 0.0) * 12.0) * 0.07 + exp(-max(d - R, 0.0) * 60.0) * 0.35;
    c += uSunCol * g * min(uSunI, 6.0) * (1.0 - disk) * uSunC;
  }

  gl_FragColor = vec4(clamp(c, 0.0, 80.0), 1.0);
}`;

export function makeSky() {
  const V = (x = 0, y = 0, z = -1) => ({ value: new THREE.Vector3(x, y, z) });
  const uniforms = {
    uSunDir: V(0, 0.1, -1), uSunR: { value: 0.0047 }, uSunCol: { value: new THREE.Color(1, 0.75, 0.45) }, uSunI: { value: 4 },
    uSunC: { value: 1 }, uSunFuzz: { value: 0 }, uPx: { value: 0.0006 }, uTime: { value: 0 },
    uCloudCov: { value: 1 }, uCloudPhase: { value: new THREE.Vector2() }, uCityGlow: { value: 1 },
    uGC: V(), uGP: V(0, 1, 0), uMW: { value: 1 },
    uAnd: V(), uAndA: V(1, 0, 0), uAndB: V(0, 1, 0), uAndR: { value: 0.02 }, uCollide: { value: 0 }, uBall: { value: 0 },
    uBack: { value: 0 }, uMerge: { value: 0 }, uGlow: { value: new THREE.Vector3() }, uFog: { value: 0 }, uSeethe: { value: 1 },
  };
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1000, 64, 32), new THREE.ShaderMaterial({ uniforms, vertexShader: vert, fragmentShader: frag, side: THREE.BackSide, depthWrite: false, depthTest: false }));
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;
  return { mesh, uniforms };
}

// rough blackbody colour (linear RGB, max channel 1) for a temperature in K
export function blackbody(T, out = new THREE.Color()) {
  const t = T / 100;
  let r, g, b;
  if (t <= 66) { r = 255; g = 99.47 * Math.log(t) - 161.12; b = t <= 19 ? 0 : 138.52 * Math.log(t - 10) - 305.04; }
  else { r = 329.7 * Math.pow(t - 60, -0.1332); g = 288.12 * Math.pow(t - 60, -0.0755); b = 255; }
  const f = (x) => Math.pow(Math.min(255, Math.max(0, x)) / 255, 2.2);
  out.setRGB(f(r), f(g), f(b));
  const m = Math.max(out.r, out.g, out.b);
  return out.multiplyScalar(1 / m);
}
// the glow's colour for a sky temperature: a fire palette (the exact blackbody colour is a greyish white from
// ~4,000 K up and doesn't read as hot on screen): deep red, orange, yellow, then a hot yellow-white
const FIRE = [new THREE.Color(1, 0.12, 0.02), new THREE.Color(1, 0.42, 0.06), new THREE.Color(1, 0.78, 0.25), new THREE.Color(1, 0.94, 0.7)];
const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
export function fireColor(T, out = new THREE.Color()) {
  if (T < 2800) out.copy(FIRE[0]).lerp(FIRE[1], sm(1300, 2800, T));
  else if (T < 5000) out.copy(FIRE[1]).lerp(FIRE[2], sm(2800, 5000, T));
  else out.copy(FIRE[2]).lerp(FIRE[3], sm(5000, 9000, T));
  return out;
}
