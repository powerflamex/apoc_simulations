// The sky over the city, from tonight to the end of everything.
//   Dusk: a sunset sky (gold, then twilight), a few clouds; the city's glow low on the horizon at night.
//   The Sun: a disk whose size, colour and brightness follow the story: it swells into a red giant (uGiant: a huge
//   dull-red disk, darker at the edge, boiling with giant convection cells), throws off its outer layers in glowing
//   shells that sweep out across the sky (uNeb), and leaves a white dwarf: a tiny, blinding point.
//   The air (uAir): thins and freezes out; with it gone the day sky is black, with stars in it.
//   Night: stars and the Milky Way, which merges with Andromeda into one big ball of stars (uBall). Far galaxies
//   (faint smudges, uFar) fade away; then the stars go out, the brightest first (uStarsOut), reddening (uStarRed).
//   In the dark: two dead stars crashing now and then (a flash, uCrash), far-off black holes evaporating (uPop).
//   The black hole (uBhR: the angular radius of its shadow): light bent around it, integrated per pixel through
//   Schwarzschild space (the black-hole Short's method), with a glowing disk of everything falling in (uDisk); later
//   its own faint Hawking glow (uHawk), getting hotter as it shrinks, and its last flash (uLastFlash) with the
//   afterglow spreading out across the sky (uShell).
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
uniform vec3 uSunDir; uniform float uSunR; uniform vec3 uSunCol; uniform float uSunI; uniform float uGiant; uniform float uSunVis; uniform float uWd; uniform vec3 uWdCol;
uniform float uPx; uniform float uTime; uniform float uCloudCov; uniform vec2 uCloudPhase; uniform float uCityGlow;
uniform float uAir; uniform float uRedSky; uniform float uNoGround;
uniform vec3 uGC; uniform vec3 uGP; uniform float uMW; uniform float uBall; uniform float uGalDim;
uniform float uStarsOut; uniform float uStarRed; uniform float uFar; uniform float uLastStar;
uniform float uNeb; uniform float uNebI;
uniform vec4 uCrash[3]; uniform vec4 uPop[4];
uniform vec3 uBhDir; uniform float uBhR; uniform float uDisk; uniform float uHawk; uniform float uLastFlash; uniform float uShell;
float hash13(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float n2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(hash12(i), hash12(i+vec2(1,0)), f.x), mix(hash12(i+vec2(0,1)), hash12(i+vec2(1,1)), f.x), f.y); }
float fbm2(vec2 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 6; i++){ s += a * n2(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; } return s; }
float noise3(vec3 p) { vec3 i = floor(p); vec3 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash13(i), hash13(i + vec3(1,0,0)), f.x), mix(hash13(i + vec3(0,1,0)), hash13(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(hash13(i + vec3(0,0,1)), hash13(i + vec3(1,0,1)), f.x), mix(hash13(i + vec3(0,1,1)), hash13(i + vec3(1,1,1)), f.x), f.y), f.z); }
float fbm3(vec3 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * noise3(p); p = p * 2.03 + 7.1; a *= 0.5; } return s; }

// point stars on a grid of cells in direction space; k: cells per unit, rare: share of empty cells. The brightest go
// out first (a star stays while its rank is under the line uStarsOut has lowered to); they redden as they age.
vec3 starField(vec3 v, float k, float rare, float gain) {
  vec3 sp = v * k;
  vec3 ci = floor(sp);
  float st = hash13(ci);
  if (st < rare) return vec3(0.0);
  float rank = (st - rare) / (1.0 - rare);
  float alive = 1.0 - smoothstep(1.0 - uStarsOut * 1.08, 1.04 - uStarsOut * 1.08, rank);
  if (alive <= 0.0) return vec3(0.0);
  vec3 cp = ci + 0.5 + (vec3(hash13(ci + 1.7), hash13(ci + 4.1), hash13(ci + 9.3)) - 0.5) * 0.7;
  float d = length(sp - cp) / k;
  float b = pow(rank, 4.0) * gain;
  float s = max(uPx * 0.75, 1e-6);
  float tc = hash13(ci + 5.5);
  vec3 col = tc < 0.2 ? vec3(1.0, 0.78, 0.55) : tc < 0.35 ? vec3(0.75, 0.85, 1.0) : vec3(1.0, 0.96, 0.9);
  col = mix(col, vec3(1.0, 0.42, 0.22), uStarRed);
  return col * b * alive * exp(-d * d / (s * s));
}

// everything out in space in direction w (no Sun, no air)
vec3 space(vec3 v) {
  vec3 sp = vec3(0.0);
  float dimC = uGalDim;
  vec3 age = mix(vec3(1.0), vec3(1.25, 0.6, 0.38), uStarRed);
  // ---- the Milky Way (fading into the merged ball) ----
  vec3 X = uGC, Y = normalize(cross(uGP, uGC));
  float b = asin(clamp(dot(v, uGP), -1.0, 1.0));
  float l = atan(dot(v, Y), dot(v, X));
  if (uMW > 0.001) {
    float prof = exp(-b * b / (0.11 * 0.11));
    float coreL = exp(-l * l / 0.55);
    float bulge = exp(-(l * l + b * b * 2.6) / 0.025) * 0.6;
    vec2 q = vec2(l * 7.0, b * 7.0);
    float clouds = fbm2(q + 3.0);
    float dust = smoothstep(0.42, 0.62, fbm2(q * 1.6 + vec2(7.0, 2.0))) * exp(-pow((b - 0.012 * sin(l * 3.0)) / 0.045, 2.0));
    float I = prof * (0.35 + 0.65 * coreL) * (0.3 + 1.2 * clouds * clouds) + bulge * 0.9 * (0.7 + 0.6 * clouds);
    I *= 1.0 - 0.85 * dust;
    vec3 mwc = mix(vec3(0.62, 0.7, 0.95), vec3(1.0, 0.8, 0.55), clamp(coreL * 0.7 + bulge, 0.0, 1.0));
    sp += mwc * I * 0.24 * uMW * dimC * age;
  }
  // ---- after the merger: one huge ball of stars, brightest toward its middle ----
  if (uBall > 0.0) {
    vec3 gc = normalize(uGC + vec3(0.0, 0.3, 0.0));
    float a = acos(clamp(dot(v, gc), -1.0, 1.0));
    float g = exp(-a * a / 0.018) * 0.9 + exp(-a * 4.0) * 0.28;
    vec3 bc = mix(vec3(1.0, 0.86, 0.66), vec3(0.85, 0.85, 0.95), smoothstep(0.0, 0.6, a));
    sp += bc * g * (0.75 + 0.5 * fbm3(v * 6.0)) * 0.2 * uBall * dimC * age;
    sp += (starField(v, 420.0, 0.85, 1.4) + starField(v, 800.0, 0.8, 0.7)) * g * 1.6 * uBall * dimC * age;
  }
  // ---- stars ----
  sp += starField(v, 230.0, 0.975, 2.6) + starField(v, 520.0, 0.988, 0.7) + starField(v, 90.0, 0.982, 14.0);
  // ---- the last star in the universe ----
  if (uLastStar > 0.0) {
    float a = acos(clamp(dot(v, normalize(vec3(-0.3, 0.36, -0.88))), -1.0, 1.0));
    sp += vec3(1.0, 0.36, 0.16) * uLastStar * (exp(-a * a / max(uPx * uPx * 3.0, 1e-10)) * 14.0 + exp(-a * 160.0) * 0.6);
  }
  // ---- far galaxies: faint tilted smudges, fading out as they leave ----
  if (uFar > 0.001) {
    for (int k = 0; k < 24; k++) {
      float fk = float(k);
      float h1 = fract(sin(fk * 12.9898) * 43758.5453), h2 = fract(sin(fk * 78.233) * 12345.678), h3 = fract(sin(fk * 39.425) * 24634.6345);
      vec3 gd = normalize(vec3(h1 * 2.0 - 1.0, 0.12 + 0.88 * h2, -0.15 - 0.9 * h3));
      vec3 a1 = normalize(cross(gd, vec3(0.3, 1.0, 0.1))), a2 = cross(gd, a1);
      float size = 0.006 + 0.008 * h3;
      vec2 q = vec2(dot(v, a1), dot(v, a2)) / size;
      float cs = cos(fk), sn = sin(fk); q = mat2(cs, -sn, sn, cs) * q; q.y *= 2.4;
      float r = length(q);
      if (r > 5.0) continue;
      float gl = (exp(-r * r * 3.0) * 1.2 + exp(-r * 1.6) * 0.4) * step(0.0, dot(v, gd));
      // the last few go one by one
      float go = clamp((uFar - fract(fk * 0.618)) * 6.0 + 1.0, 0.0, 1.0);
      sp += mix(vec3(1.0, 0.45, 0.3), vec3(0.85, 0.82, 1.0), uFar) * gl * 0.16 * go;
    }
  }
  // ---- two dead stars crashing: a flash and its glow ----
  for (int i = 0; i < 3; i++) {
    vec4 c = uCrash[i];
    if (c.w <= 0.0) continue;
    float a = acos(clamp(dot(v, normalize(c.xyz)), -1.0, 1.0));
    sp += vec3(0.8, 0.88, 1.0) * c.w * (exp(-a * a / max(uPx * uPx * 9.0, 1e-9)) * 60.0 + exp(-a * 40.0) * 2.0 + exp(-a * 6.0) * 0.18);
  }
  for (int i = 0; i < 4; i++) {
    vec4 c = uPop[i];
    if (c.w <= 0.0) continue;
    float a = acos(clamp(dot(v, normalize(c.xyz)), -1.0, 1.0));
    sp += vec3(0.85, 0.9, 1.0) * c.w * (exp(-a * a / max(uPx * uPx * 4.0, 1e-9)) * 40.0 + exp(-a * 90.0) * 1.2);
  }
  // ---- the shells of the Sun's outer layers, sweeping out across the sky ----
  if (uNebI > 0.0) {
    vec3 S = normalize(uSunDir);
    float a = acos(clamp(dot(v, S), -1.0, 1.0));
    vec3 tA = normalize(cross(S, vec3(0.0, 1.0, 0.0))), tB = cross(tA, S);
    float ang = atan(dot(v, tB), dot(v, tA));
    for (int k = 0; k < 3; k++) {
      float fk = float(k);
      float rho = (0.03 + 3.1 * pow(uNeb, 0.8)) * (1.0 - 0.22 * fk);
      float w = 0.02 + 0.28 * rho;
      float fil = 0.45 + 0.9 * fbm2(vec2(ang * 3.0 + fk * 7.0, a * 6.0 - uNeb * 3.0));
      float ring = exp(-pow((a - rho) / w, 2.0)) * fil;
      vec3 c = k == 0 ? vec3(1.0, 0.24, 0.2) : k == 1 ? vec3(0.95, 0.5, 0.65) : vec3(0.25, 0.9, 0.85);
      sp += c * ring * uNebI * 0.55 * (1.0 - 0.25 * fk);
    }
    // the inside of the shells: a teal haze
    sp += vec3(0.15, 0.55, 0.5) * exp(-a * a / max(pow(0.03 + 3.1 * pow(uNeb, 0.8), 2.0) * 0.5, 1e-4)) * uNebI * 0.12;
  }
  // ---- the last light's afterglow, spreading out and reddening ----
  if (uShell > 0.0) {
    float a = acos(clamp(dot(v, normalize(uBhDir)), -1.0, 1.0));
    float rho = 0.05 + 2.2 * (1.0 - exp(-uShell / 9.0));
    float e = exp(-uShell / 8.0);
    vec3 c = mix(vec3(1.0, 0.22, 0.08), vec3(0.95, 0.9, 1.0), e);
    sp += c * exp(-pow((a - rho) / (0.04 + 0.25 * rho), 2.0)) * e * 0.7 * (0.6 + 0.6 * fbm2(vec2(atan(v.x, v.z) * 4.0, a * 3.0)));
  }
  return sp;
}

// ---------- the black hole (BH frame, r_s = 1) ----------
vec4 disk(vec3 p, vec3 vel, vec3 nD, vec3 e1, vec3 e2) {
  float x = dot(p, e1), z = dot(p, e2);
  float r = length(vec2(x, z));
  float inner = 3.0, outer = 16.0;
  if (r < inner * 0.9 || r > outer) return vec4(0.0);
  float a = atan(z, x);
  float rot = uTime * 1.2 * pow(r / 3.0, -1.5);
  float ang = a - rot;
  vec3 np = vec3(cos(ang) * r * 0.9, sin(ang) * r * 0.9, r * 1.4);
  float n = fbm3(np * 0.9);
  float streak = fbm3(vec3(r * 3.2, cos(ang) * 1.2, sin(ang) * 1.2));
  float I = pow(inner / r, 2.0) * smoothstep(inner * 0.92, inner * 1.15, r) * (1.0 - smoothstep(outer * 0.55, outer, r));
  I *= 0.45 + 1.1 * n * (0.6 + 0.8 * streak);
  vec3 tang = normalize(cross(nD, p));
  float dop = dot(tang, -normalize(vel));
  float beam = pow(1.0 + 0.55 * dop, 3.0);
  float temp = clamp(I * beam * 1.2, 0.0, 2.0);
  vec3 col = mix(vec3(0.9, 0.25, 0.06), vec3(1.0, 0.62, 0.3), smoothstep(0.1, 0.6, temp));
  col = mix(col, vec3(1.0, 0.95, 0.88), smoothstep(0.7, 1.6, temp));
  float alpha = clamp(I * 2.4, 0.0, 0.97);
  return vec4(col * I * beam * 2.6 * uDisk, alpha * min(uDisk * 2.0, 1.0));
}

void main() {
  vec3 v = normalize(vDir);
  float h = clamp(v.y, 0.0, 1.0);
  vec3 S = normalize(uSunDir);
  float e = degrees(asin(clamp(S.y, -1.0, 1.0)));
  vec3 sh = normalize(vec3(S.x, 0.0, S.z) + vec3(1e-4, 0.0, 0.0));
  float az = dot(normalize(vec3(v.x, 0.0, v.z) + vec3(1e-5, 0.0, 0.0)), sh) * 0.5 + 0.5;
  float sunSide = pow(az, 3.0);

  // ---- the air's colour for the Sun's elevation ----
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
  // the red giant fills the air with its light: a deep orange-red sky, brightest around it
  float aS = acos(clamp(dot(v, S), -1.0, 1.0));
  vec3 redSky = vec3(0.75, 0.2, 0.05) * (0.35 + 0.9 * exp(-max(aS - uSunR, 0.0) * 2.2)) * (0.55 + 0.45 * exp(-h * 3.0)) + vec3(0.25, 0.04, 0.02) * (1.0 - h);
  c = mix(c, redSky, uRedSky);
  float night = 1.0 - smoothstep(-14.0, -4.0, e);
  c += vec3(0.3, 0.16, 0.07) * exp(-h * 9.0) * uCityGlow * night;
  // the air thins and freezes out: the sky goes black
  c *= uAir;
  float starVis = max(night * (1.0 - 0.55 * exp(-h * 6.0) * uCityGlow), 1.0 - uAir);
  float clearSky = starVis * mix(smoothstep(-0.01, 0.05, v.y), 1.0, uNoGround);

  // ---- clouds at dusk ----
  if (v.y > 0.0 && uCloudCov > 0.0) {
    float dist = 3000.0 / max(v.y, 0.03);
    vec2 p = v.xz * dist / 2600.0 + uCloudPhase;
    float n = fbm3(vec3(p * vec2(1.0, 0.55), 1.7));
    float cov = smoothstep(0.6, 0.78, n) * (1.0 - smoothstep(25000.0, 60000.0, dist)) * uCloudCov;
    float lit = fbm3(vec3(p * 3.0, 4.0));
    vec3 cg = mix(vec3(0.28, 0.16, 0.26), vec3(1.1, 0.48, 0.24), (0.3 + 0.7 * lit) * (0.45 + 0.6 * sunSide));
    vec3 cc = e > -1.0 ? cg : mix(vec3(0.02, 0.025, 0.05), cg * 0.6, smoothstep(-8.0, -1.0, e));
    c = mix(c, cc, cov * 0.9);
  }

  // ---- space, bent around the black hole when there is one ----
  vec3 sp;
  vec3 holeCol = vec3(0.0);
  float holeA = 0.0;
  if (uBhR > 0.0) {
    vec3 F = normalize(uBhDir);
    vec3 R = normalize(cross(F, vec3(0.0, 1.0, 0.0)));
    vec3 U = cross(R, F);
    vec3 d = vec3(dot(v, R), dot(v, U), dot(v, F));
    float D = 2.598 / uBhR;
    float sinT = length(d.xy);
    float cosT = d.z;
    float b = D * sinT;
    vec3 outDir;
    bool strong = cosT > 0.0 && b < 32.0;
    if (!strong) {
      float alpha_d = (1.0 + cosT) / max(D * sinT, 1e-4);
      float theta = atan(sinT, cosT);
      float beta = theta - alpha_d;
      vec2 rad = d.xy / max(sinT, 1e-6);
      outDir = vec3(rad * sin(beta), cos(beta));
    } else {
      vec3 pos = vec3(0.0, 0.0, -D);
      vec3 dir = d;
      if (D > 70.0) {
        float pd = dot(pos, dir);
        float disc = pd * pd - (D * D - 4900.0);
        pos += dir * (-pd - sqrt(max(disc, 0.0)));
        float u0 = -cosT, u1 = -sqrt(max(1.0 - b * b / 4900.0, 0.0));
        float pre = ((1.5 * u1 - 0.5 * u1 * u1 * u1) - (1.5 * u0 - 0.5 * u0 * u0 * u0)) / max(b, 1e-3);
        float th = atan(sinT, cosT) - pre;
        dir = vec3(d.xy / max(sinT, 1e-6) * sin(th), cos(th));
      }
      vec3 nD = normalize(vec3(0.1, 0.975, -0.2));
      vec3 e1 = normalize(cross(nD, vec3(0.0, 0.0, 1.0)));
      vec3 e2 = cross(e1, nD);
      vec3 c3 = cross(pos, dir);
      float h2 = dot(c3, c3);
      vec3 vel = dir;
      bool captured = false;
      for (int i = 0; i < 260; i++) {
        float r2 = dot(pos, pos);
        float r = sqrt(r2);
        float dt = clamp(0.06 * r, 0.012, 4.0);
        vec3 acc = -1.5 * h2 * pos / (r2 * r2 * r);
        vec3 prev = pos;
        vel += acc * dt;
        pos += vel * dt;
        if (uDisk > 0.001) {
          float a0 = dot(prev, nD), a1 = dot(pos, nD);
          if (a0 * a1 < 0.0) {
            vec3 hit = mix(prev, pos, a0 / (a0 - a1));
            vec4 ee = disk(hit, vel, nD, e1, e2);
            holeCol += (1.0 - holeA) * ee.rgb;
            holeA += (1.0 - holeA) * ee.a;
          }
        }
        if (r < 1.0) { captured = true; break; }
        if (r > 75.0 && dot(pos, vel) > 0.0) break;
      }
      if (captured) holeA = 1.0;
      outDir = normalize(vel);
      // its own faint glow (Hawking radiation), hotter and brighter as it shrinks
      float rr = sinT * D / 2.598;    // 1 at the shadow's edge
      holeCol += mix(vec3(0.9, 0.3, 0.1), vec3(0.9, 0.95, 1.0), uHawk) * uHawk * (exp(-pow((rr - 1.0) / 0.12, 2.0)) * 0.8 + exp(-max(rr - 1.0, 0.0) * 3.0) * 0.25 + (captured ? 0.12 * uHawk : 0.0));
    }
    vec3 w = normalize(R * outDir.x + U * outDir.y + F * outDir.z);
    sp = holeCol + (1.0 - holeA) * space(w);
  } else sp = space(v);
  // the last flash: blinding, where the black hole was
  if (uLastFlash > 0.0) {
    float a = acos(clamp(dot(v, normalize(uBhDir)), -1.0, 1.0));
    sp += vec3(0.95, 0.97, 1.0) * uLastFlash * (exp(-a * 6.0) * 6.0 + exp(-a * 40.0) * 30.0 + 0.8);
  }
  c = c * (1.0 - holeA * clearSky) + sp * clearSky;

  // ---- the Sun: a disk with its glare; huge, dark-edged and boiling as a red giant; a point as a white dwarf ----
  if (uSunVis > 0.0 && uSunR > 0.0) {
    float d = aS;
    float R = uSunR;
    float soft = uPx * 1.5 + R * 0.01;
    float disk = 1.0 - smoothstep(R - soft, R + soft, d);
    float mu = sqrt(max(1.0 - pow(d / R, 2.0), 0.0));
    vec3 tA = normalize(cross(S, vec3(0.0, 1.0, 0.0))), tB = cross(tA, S);
    vec2 q = vec2(dot(v, tA), dot(v, tB)) / max(R, 1e-5);
    float cells = fbm2(q * 5.0 + vec2(uTime * 0.05, 0.0)) * 0.6 + fbm2(q * 14.0 - vec2(0.0, uTime * 0.08)) * 0.4;
    vec3 sc = uSunCol * uSunI * mix(1.0, (0.35 + 0.65 * pow(mu, 0.7)) * (0.55 + 0.9 * cells), uGiant);
    c = mix(c, sc, disk * uSunVis);
    float g = exp(-max(d - R, 0.0) * 12.0) * 0.07 + exp(-max(d - R, 0.0) * 60.0) * 0.35 + exp(-max(d - R, 0.0) * 400.0) * 1.5 * (1.0 - uGiant);
    c += uSunCol * g * min(uSunI, 8.0) * (1.0 - disk) * uSunVis * (1.0 - 0.85 * uGiant);
  }
  // the white dwarf: a tiny, blinding point with its glare
  if (uWd > 0.0) {
    float d = aS;
    float core = exp(-d * d / max(uPx * uPx * 2.5, 1e-10));
    c += uWdCol * uWd * (core * 60.0 + exp(-d * 260.0) * 2.5 + exp(-d * 40.0) * 0.35 + exp(-d * 8.0) * 0.05);
  }
  gl_FragColor = vec4(clamp(c, 0.0, 80.0), 1.0);
}`;

export function makeSky() {
  const V = (x = 0, y = 0, z = -1) => ({ value: new THREE.Vector3(x, y, z) });
  const uniforms = {
    uSunDir: V(0, 0.1, -1), uSunR: { value: 0.0047 }, uSunCol: { value: new THREE.Color(1, 0.75, 0.45) }, uSunI: { value: 4 }, uGiant: { value: 0 }, uSunVis: { value: 1 },
    uWd: { value: 0 }, uWdCol: { value: new THREE.Color(1, 1, 1) },
    uPx: { value: 0.0006 }, uTime: { value: 0 }, uCloudCov: { value: 1 }, uCloudPhase: { value: new THREE.Vector2() }, uCityGlow: { value: 1 },
    uAir: { value: 1 }, uRedSky: { value: 0 }, uNoGround: { value: 0 },
    uGC: V(), uGP: V(0, 1, 0), uMW: { value: 1 }, uBall: { value: 0 }, uGalDim: { value: 1 },
    uStarsOut: { value: 0 }, uStarRed: { value: 0 }, uFar: { value: 1 }, uLastStar: { value: 0 }, uNeb: { value: 0 }, uNebI: { value: 0 },
    uCrash: { value: [new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4()] },
    uPop: { value: [new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4()] },
    uBhDir: V(0, 0.5, -0.86), uBhR: { value: 0 }, uDisk: { value: 0 }, uHawk: { value: 0 }, uLastFlash: { value: 0 }, uShell: { value: 0 },
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
