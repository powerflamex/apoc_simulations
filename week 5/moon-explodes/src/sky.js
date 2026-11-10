// The sky dome: the night over the harbour (city glow on the horizon, a few stars, drifting clouds lit orange from
// below), and the Moon coming apart, drawn analytically per pixel:
//   - the Moon (its real maria) cut into 7 pieces along jagged lines (a Voronoi partition of the disc). Before the burst
//     the cracks glow and spread; then each piece drifts off and tumbles (uOff, uRot); when it is hit it breaks into
//     5 (a second partition inside it, the bits spreading: uShat). The cut faces are bare grey rock, glowing hot at first.
//     Everything is in "true" angles divided by the lens's magnification uM (the telephoto look on frame 0).
//   - the dust and rubble: a glowing cloud round the pieces that grows and stretches along the Moon's orbit (uStretch),
//     then the ring (uRing): a band along the orbit's great circle, with Earth's shadow on it at the anti-Sun point;
//     sparkles (single pieces catching the Sun) at three scales.
//   - flashes where pieces hit (uFlash), the time-lapse's leaps (uLeap), fireball light (uFlashSky), the heat (uHeat).
import * as THREE from 'three';
import { MOON_AZ, MOON_EL, ORBIT_TILT } from './layout.js';
import { ALPHA } from './timeline.js';

const DEG = Math.PI / 180;
const dirOf = (az, el) => new THREE.Vector3(Math.sin(az * DEG) * Math.cos(el * DEG), Math.sin(el * DEG), -Math.cos(az * DEG) * Math.cos(el * DEG));
export const MOON_DIR = dirOf(MOON_AZ, MOON_EL);
export const SCR_R = new THREE.Vector3(Math.cos(MOON_AZ * DEG), 0, Math.sin(MOON_AZ * DEG));
export const SCR_UP = new THREE.Vector3(-Math.sin(MOON_AZ * DEG) * Math.sin(MOON_EL * DEG), Math.cos(MOON_EL * DEG), Math.cos(MOON_AZ * DEG) * Math.sin(MOON_EL * DEG));
// along the orbit (toward the upper right on screen) and across it
export const ORB_U = SCR_R.clone().multiplyScalar(Math.cos(ORBIT_TILT * DEG)).addScaledVector(SCR_UP, Math.sin(ORBIT_TILT * DEG)).normalize();
export const ORB_W = SCR_UP.clone().multiplyScalar(Math.cos(ORBIT_TILT * DEG)).addScaledVector(SCR_R, -Math.sin(ORBIT_TILT * DEG)).normalize();
// the point opposite the Sun (Earth's shadow): 3.5° below the Moon (it was full, just missing an eclipse)
export const ANTI_SUN = MOON_DIR.clone().addScaledVector(SCR_UP, -3.5 * DEG).normalize();
// a point on the ring at angle phi along the orbit from where the Moon was
export const ringDir = (phi) => MOON_DIR.clone().multiplyScalar(Math.cos(phi)).addScaledVector(ORB_U, Math.sin(phi));

// the Moon's face (also used by the 3D pieces in rocks.js)
export const MOON_FNS = /* glsl */ `
  float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
  float h31(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
  float vn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
  float fbm(vec2 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * vn(p); p = p * 2.03 + 7.1; a *= 0.5; } return s; }
  vec2 rot2(vec2 p, float a) { float c = cos(a), s = sin(a); return vec2(c * p.x - s * p.y, s * p.x + c * p.y); }

  // ---- the Moon's face (screen-aligned, unit disc): the real maria, roughly where they are ----
  float blob(vec2 x, vec2 c, vec2 r) { vec2 d = (x - c) / r; return smoothstep(1.0, 0.5, length(d) + 0.22 * (vn(x * 9.0 + c * 5.0) - 0.5)); }
  vec3 moonAlbedo(vec2 x) {
    float m = blob(x, vec2(-0.32, 0.36), vec2(0.30, 0.25)) + blob(x, vec2(0.17, 0.39), vec2(0.16, 0.14))
      + blob(x, vec2(0.34, 0.11), vec2(0.21, 0.17)) + blob(x, vec2(0.66, 0.30), vec2(0.10, 0.08))
      + blob(x, vec2(0.50, -0.20), vec2(0.13, 0.17)) + blob(x, vec2(0.30, -0.32), vec2(0.10, 0.10))
      + blob(x, vec2(-0.18, -0.30), vec2(0.16, 0.12)) + blob(x, vec2(-0.64, 0.04), vec2(0.24, 0.44))
      + blob(x, vec2(-0.47, -0.37), vec2(0.08, 0.08)) + 0.6 * blob(x, vec2(0.0, 0.06), vec2(0.13, 0.1));
    m = clamp(m, 0.0, 1.0);
    float n = vn(x * 34.0) * 0.6 + vn(x * 80.0) * 0.4;
    vec3 hi = vec3(0.86, 0.84, 0.8), lo = vec3(0.46, 0.46, 0.48);
    vec3 a = mix(hi, lo, m) * (0.86 + 0.24 * n);
    // a bright young crater with rays low down (like Tycho)
    vec2 ty = x - vec2(-0.12, -0.72);
    a += vec3(0.25) * exp(-dot(ty, ty) * 900.0) + vec3(0.06) * (0.5 + 0.5 * sin(atan(ty.y, ty.x) * 14.0)) * exp(-length(ty) * 4.0) * (1.0 - m);
    return a;
  }

`;

const GLSL = /* glsl */ `
  uniform vec3 uD, uRt, uUp, uU, uW, uAnti, uCamPos, uFlashSky, uChunkDir;
  uniform float uM, uPx, uTime, uCrack, uBurst, uHot, uPieces, uCut;
  uniform vec2 uOff[7];
  uniform float uRot[7];
  uniform float uScale[7];
  uniform float uShat[7];
  uniform float uSubRot[7];
  uniform vec4 uFlash[8];
  uniform float uDust, uDustR, uStretch, uRing, uBand, uSkyL, uStars, uCity, uHeat, uRain, uChunkI, uLeap, uClear, uBlack;
  varying vec3 vDir;
  const float ALPHA = ${ALPHA.toFixed(8)};

  ${MOON_FNS}
  // ---- the cut: 7 pieces (jagged lines), each later cut in 5 ----
  const vec2 SEED0 = vec2(0.03, -0.04), SEED1 = vec2(0.62, 0.15), SEED2 = vec2(0.17, 0.64), SEED3 = vec2(-0.48, 0.43),
             SEED4 = vec2(-0.63, -0.19), SEED5 = vec2(-0.14, -0.64), SEED6 = vec2(0.46, -0.46);
  vec2 seedOf(int i) { return i == 0 ? SEED0 : i == 1 ? SEED1 : i == 2 ? SEED2 : i == 3 ? SEED3 : i == 4 ? SEED4 : i == 5 ? SEED5 : SEED6; }
  vec2 warp(vec2 x) { return x + 0.05 * vec2(sin(x.y * 21.0 + 1.3) + 0.6 * sin(x.x * 37.0 + x.y * 11.0), sin(x.x * 19.0 + 2.1) + 0.6 * sin(x.y * 33.0 - x.x * 13.0)); }
  // nearest seed: (index, distance to the cut)
  vec2 near7(vec2 x) {
    float d1 = 1e9, d2 = 1e9, id = 0.0;
    for (int i = 0; i < 7; i++) { float d = distance(x, seedOf(i)); if (d < d1) { d2 = d1; d1 = d; id = float(i); } else if (d < d2) d2 = d; }
    return vec2(id, (d2 - d1) * 0.5);
  }
  vec2 subSeed(int i, int j) { float k = float(i * 5 + j); return seedOf(i) + (vec2(h21(vec2(k, 3.7)), h21(vec2(k, 9.1))) - 0.5) * 0.62; }
  vec2 near5(int i, vec2 x) {
    float d1 = 1e9, d2 = 1e9, id = 0.0;
    for (int j = 0; j < 5; j++) { float d = distance(x, subSeed(i, j)); if (d < d1) { d2 = d1; d1 = d; id = float(j); } else if (d < d2) d2 = d; }
    return vec2(id, (d2 - d1) * 0.5);
  }
  // what a point x of the original Moon looks like (aa: one pixel in Moon radii; e: distance to its piece's cut)
  vec4 surface(vec2 x, float e, float aa) {
    float r2 = dot(x, x);
    vec3 n = vec3(x, sqrt(max(1.0 - r2, 0.0)));
    float lum = 0.12 + 0.88 * pow(max(dot(n, normalize(vec3(-0.3, 0.14, 1.0))), 0.0), 0.42);
    vec3 col = moonAlbedo(x) * lum * 0.95;
    // the cut faces: bare grey rock (and glowing hot just after the burst); before it, the cracks glow white-orange
    float faceW = 0.055 + 0.03 * uHot;
    float face = (1.0 - smoothstep(0.0, faceW, e)) * uCut;
    col = mix(col, vec3(0.42, 0.39, 0.36) * lum * 1.2, face * 0.85);
    col += vec3(3.2, 1.25, 0.35) * face * uHot * (1.0 - e / faceW) * 1.6;
    float cw = 0.008 + 0.022 * uCrack;
    float spread = smoothstep(0.0, 0.12, uCrack * 1.5 - 0.95 * vn(x * 2.3 + 4.0));
    float crack = (1.0 - smoothstep(0.0, cw, e)) * spread * uCrack;
    col = mix(col, vec3(4.0, 2.4, 1.1) * (0.6 + 0.8 * uCrack), crack);
    col += vec3(1.4, 0.7, 0.3) * exp(-e / (cw * 2.5)) * spread * uCrack * 0.7;
    float a = smoothstep(1.0, 1.0 - 1.5 * aa, sqrt(r2));
    if (uCut > 0.0) a *= smoothstep(0.0, 1.2 * aa, e);
    return vec4(col, a);
  }
  // the pieces at q (true position in Moon radii, screen-aligned)
  vec4 pieces(vec2 q, float aa0) {
    float aa = aa0;
    for (int i = 0; i < 7; i++) {
      vec2 c = seedOf(i);
      // (uScale: a piece drifting toward you looks bigger)
      vec2 xp = rot2((q - c - uOff[i]) / uScale[i], -uRot[i]) + c;
      aa = aa0 / uScale[i];
      float sh = uShat[i];
      if (length(xp - c) > 0.95 + sh * 1.6) continue;
      if (sh <= 0.0) {
        if (dot(xp, xp) > 1.0) continue;
        vec2 n7 = near7(warp(xp));
        if (int(n7.x + 0.5) != i) continue;
        return surface(xp, n7.y, aa);
      }
      for (int j = 0; j < 5; j++) {
        vec2 sj = subSeed(i, j);
        vec2 x = rot2(xp - sj - (sj - c) * sh * 2.2, -uSubRot[i] * (float(j) - 2.0)) + sj;
        if (dot(x, x) > 1.0) continue;
        vec2 n7 = near7(warp(x));
        if (int(n7.x + 0.5) != i) continue;
        vec2 n5 = near5(i, warp(x * 1.7 + 0.3));
        if (int(n5.x + 0.5) != j) continue;
        return surface(x, min(n7.y, n5.y), aa);
      }
    }
    return vec4(0.0);
  }
  // sparkles: single pieces catching the Sun, one per grid cell (cell size csz in radians on screen)
  float sparks(vec2 g, float csz, float dens, float seed) {
    vec2 id = floor(g), f = fract(g) - 0.5;
    float h = h21(id + seed);
    if (h > dens) return 0.0;
    vec2 o = (vec2(h21(id + seed + 3.1), h21(id + seed + 7.7)) - 0.5) * 0.7;
    float dp = length(f - o) * csz / uPx;
    float tw = 0.75 + 0.25 * sin(uTime * (3.0 + 6.0 * h21(id + 1.3)) + h * 40.0);
    return exp(-dp * dp * 1.4) * (0.25 + 0.75 * pow(h21(id + seed + 5.3), 3.0)) * tw;
  }

  // rocks: lumpy discs (sunlit on one side), one per grid cell (cell size csz in radians on screen)
  float rocks(vec2 g, float csz, float dens, float seed) {
    vec2 id = floor(g), f = fract(g) - 0.5;
    float h = h21(id + seed);
    if (h > dens) return 0.0;
    vec2 o = (vec2(h21(id + seed + 3.1), h21(id + seed + 7.7)) - 0.5) * 0.5;
    vec2 dd = f - o;
    float a = atan(dd.y, dd.x);
    float r = (0.07 + 0.2 * pow(h21(id + seed + 2.3), 2.0)) * (1.0 + 0.22 * sin(a * 3.0 + h * 40.0) + 0.12 * sin(a * 5.0 + h * 17.0));
    float pxc = uPx / csz;
    float disc = smoothstep(r + pxc, r - pxc, length(dd));
    float lit = 0.45 + 0.55 * clamp(dot(dd / max(r, 1e-4), vec2(0.6, 0.8)) * 0.8 + 0.5, 0.0, 1.0);
    return disc * lit * (0.35 + 0.65 * h21(id + seed + 5.3));
  }

  vec3 skyColor(vec3 d) {
    float el = d.y;
    vec3 col = mix(vec3(0.012, 0.016, 0.034), vec3(0.0025, 0.0045, 0.013), smoothstep(0.0, 0.55, el));
    // the city's glow on the low sky (strongest over the skyline ahead), fading as the lights fail
    float ahead = smoothstep(-0.3, 0.9, -d.z);
    col += vec3(0.11, 0.055, 0.04) * exp(-max(el, 0.0) * 10.0) * uCity * (0.45 + 0.55 * ahead);
    col += vec3(0.03, 0.02, 0.025) * exp(-max(el, 0.0) * 3.0) * uCity;
    // light scattered by the air from the bright sky (the ring), and fireball flashes
    col += vec3(0.016, 0.02, 0.03) * uSkyL * (0.5 + 0.5 * exp(-max(el, 0.0) * 2.0));
    col += uFlashSky * (0.35 + 0.65 * exp(-max(el, 0.0) * 4.0));
    // the heat of the hard rain: the low sky glows red-orange
    col += vec3(0.15, 0.035, 0.01) * uHeat * (0.3 + 0.7 * exp(-max(el, 0.0) * 3.0));
    // stars (few, through the city glow)
    vec3 sp = d * 160.0, id = floor(sp), f = fract(sp) - 0.5;
    float hs = h31(id);
    if (hs > 0.955) {
      vec3 o = (vec3(h31(id + 1.7), h31(id + 4.3), h31(id + 9.1)) - 0.5) * 0.6;
      float dd = length(f - o) / 160.0 / uPx;
      col += vec3(0.8, 0.86, 1.0) * exp(-dd * dd * 1.8) * pow(h31(id + 2.2), 4.0) * 0.7 * uStars * smoothstep(0.02, 0.2, el);
    }

    // ---- the Moon and what it becomes ----
    float dd0 = dot(d, uD);
    vec3 deb = vec3(0.0);
    if (dd0 > 0.0 || uRing > 0.0) {
      float phi = atan(dot(d, uU), dd0), psi = asin(clamp(dot(d, uW), -1.0, 1.0));
      // magnified (lens) coordinates -> true angles
      vec2 tr = vec2(phi, psi) / uM;
      // the dust: a cloud round the pieces, stretched along the orbit, then the ring
      float sR = uDustR * ALPHA;
      vec2 w = vec2(tr.x / (sR * uStretch), tr.y / sR);
      float wr = length(w);
      float blobD = exp(-wr * wr * 2.2) * (0.35 + 1.0 * fbm(w * 2.4 + 3.1)) * (0.7 + 0.6 * fbm(w * 7.0 - 2.3));
      // the ring: a band of rubble with a ragged edge, lumpy along its length (clumps ~1-3 degrees across, the same
      // size both ways, so it reads as heaps of rock and dust, not as smooth strands or rays)
      float edgeN = (fbm(vec2(phi * 18.0, 4.0)) - 0.5) * 0.03;
      float core = smoothstep(0.052, 0.03, abs(psi - edgeN));
      float clump = smoothstep(0.32, 0.78, fbm(vec2(phi, psi) * 46.0 + 3.0)) * 0.8 + 0.35 * fbm(vec2(phi, psi) * 150.0 - 1.7);
      float bandD = core * (0.18 + 1.2 * clump) + 0.12 * exp(-0.5 * pow(psi / 0.09, 2.0)) * (0.5 + fbm(vec2(phi, psi) * 30.0));
      float dens = mix(blobD, bandD, uRing);
      // Earth's shadow on the ring (at the anti-Sun point), and the phase: brighter toward it
      float sa = acos(clamp(dot(d, uAnti), -1.0, 1.0));
      float shade = mix(0.12, 1.0, smoothstep(0.012, 0.03, sa)) * (0.75 + 0.25 * max(dot(d, uAnti), 0.0));
      vec3 dustCol = mix(vec3(0.85, 0.82, 0.78), vec3(2.6, 1.0, 0.3), uHot);
      deb += dustCol * dens * uDust * mix(1.0, uBand, uRing) * mix(1.0, shade, uRing) * (1.0 + 0.6 * uLeap);
      // sparkles: in the cloud (they ride out with it), and in the ring
      float px = uPx;
      float cs1 = 0.05 * sR * uStretch * uM;
      float sp = 0.0;
      if (uRing < 1.0) {
        float k = exp(-wr * wr * 1.2) * (1.0 - uRing);
        sp += sparks(w / 0.05, max(cs1, px * 3.0), 0.5 * k, 1.0);
        sp += sparks(w / 0.024, max(cs1 * 0.48, px * 3.0), 0.55 * k * smoothstep(2.0, 6.0, uTime), 2.0);
      }
      float rk = 0.0;
      if (uRing > 0.0) {
        float k = (smoothstep(0.06, 0.03, abs(psi - edgeN)) + 0.2 * exp(-0.5 * pow(psi / 0.1, 2.0))) * uRing;
        sp += sparks(vec2(phi, psi) / 0.004, 0.004, 0.45 * k, 5.0) + sparks(vec2(phi, psi) / 0.0021, 0.0021, 0.4 * k, 6.0);
        // single rocks big enough to see as rocks (a few pixels to ~8 across), thickest in the clumps
        rk = rocks(vec2(phi, psi) / 0.011, 0.011, 0.5 * k * (0.4 + clump), 11.0) + rocks(vec2(phi, psi) / 0.0055, 0.0055, 0.45 * k * (0.4 + clump), 12.0);
      }
      deb += vec3(2.4, 2.3, 2.1) * sp * (0.5 + 0.5 * uDust) * mix(1.0, shade, uRing);
      deb += vec3(1.5, 1.42, 1.32) * rk * mix(1.0, shade, uRing);
      // the pieces themselves (screen-aligned gnomonic coordinates round the Moon, in true Moon radii)
      if (uPieces > 0.0 && dd0 > 0.9) {
        vec2 p = vec2(dot(d, uRt), dot(d, uUp)) / dd0;
        vec2 q = p / (uM * ALPHA);
        float aa = uPx / (uM * ALPHA);
        if (length(q) < 8.0) {
          vec4 pc = pieces(q, aa);
          deb = mix(deb, pc.rgb, pc.a * uPieces);
        }
        // the burst's flash
        deb += vec3(2.4, 1.9, 1.4) * uBurst * (exp(-dot(q, q) * 1.6) * 0.9 + exp(-dot(q, q) * 0.4) * 0.08);
        // the flashes where pieces hit each other
        for (int k = 0; k < 8; k++) {
          vec4 fl = uFlash[k];
          if (fl.w <= 0.0) continue;
          vec2 dp = (p - fl.xy) / fl.z;
          deb += vec3(3.6, 2.6, 1.7) * fl.w * (exp(-dot(dp, dp)) * 1.4 + exp(-dot(dp, dp) * 0.2) * 0.06);
        }
      }
    }
    // the debris is above the air: the haze near the horizon dims it
    col += deb * smoothstep(-0.02, 0.06, el);
    // the giant chunk's glow
    float ca = max(dot(d, uChunkDir), 0.0);
    col += vec3(3.0, 1.6, 0.7) * uChunkI * (pow(ca, 60.0) * 2.0 + pow(ca, 6.0) * 0.4);

    // ---- clouds (a scattered deck ~1.6 km up), lit from below by the city and from above by the sky ----
    if (el > 0.0) {
      float t = 1600.0 / max(el, 0.025);
      vec2 P = uCamPos.xz + d.xz * t;
      vec2 cp = P / 2300.0 + vec2(uTime * 0.012, uTime * 0.004);
      float c = fbm(cp);
      float cov = smoothstep(0.54, 0.82, c + 0.08 * uHeat) * smoothstep(0.0, 0.07, el) * (1.0 - smoothstep(30000.0, 60000.0, t));
      cov *= mix(1.0, smoothstep(0.1, 0.25, acos(clamp(dd0, -1.0, 1.0))), uClear);
      float lit = 0.6 + 0.8 * fbm(cp * 2.7 + 1.3);
      vec3 cc = vec3(0.1, 0.06, 0.055) * uCity * exp(-t / 16000.0) * lit + vec3(0.012, 0.012, 0.018) + vec3(0.12, 0.13, 0.15) * uSkyL * lit
        + vec3(0.55, 0.13, 0.03) * uHeat * (0.4 + 1.0 * fbm(cp * 3.0 + uTime * 0.05)) + uFlashSky * 0.8 * lit;
      col = mix(col, cc, cov * 0.75);
    }
    return col;
  }
`;

export function makeSky() {
  const uniforms = {
    uD: { value: MOON_DIR.clone() }, uRt: { value: SCR_R.clone() }, uUp: { value: SCR_UP.clone() },
    uU: { value: ORB_U.clone() }, uW: { value: ORB_W.clone() }, uAnti: { value: ANTI_SUN.clone() },
    uCamPos: { value: new THREE.Vector3() }, uFlashSky: { value: new THREE.Color(0, 0, 0) }, uChunkDir: { value: new THREE.Vector3(0, 1, 0) },
    uM: { value: 18.5 }, uPx: { value: 0.0005 }, uTime: { value: 0 }, uCut: { value: 0 }, uCrack: { value: 0 }, uBurst: { value: 0 }, uHot: { value: 0 }, uPieces: { value: 1 },
    uOff: { value: Array.from({ length: 7 }, () => new THREE.Vector2()) },
    uRot: { value: new Array(7).fill(0) }, uScale: { value: new Array(7).fill(1) }, uShat: { value: new Array(7).fill(0) }, uSubRot: { value: new Array(7).fill(0) },
    uFlash: { value: Array.from({ length: 8 }, () => new THREE.Vector4(0, 0, 1, 0)) },
    uDust: { value: 0 }, uDustR: { value: 1 }, uStretch: { value: 1 }, uRing: { value: 0 }, uBand: { value: 1 }, uSkyL: { value: 0 },
    uStars: { value: 1 }, uCity: { value: 1 }, uHeat: { value: 0 }, uRain: { value: 0 }, uChunkI: { value: 0 }, uLeap: { value: 0 }, uClear: { value: 1 }, uBlack: { value: 0 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms, side: THREE.BackSide, depthWrite: false, fog: false,
    vertexShader: /* glsl */ `varying vec3 vDir;
      void main() { vec4 w = modelMatrix * vec4(position, 1.0); vDir = w.xyz - cameraPosition; gl_Position = projectionMatrix * viewMatrix * w; gl_Position.z = gl_Position.w * 0.99999; }`,
    fragmentShader: GLSL + /* glsl */ `
      void main() { gl_FragColor = vec4(skyColor(normalize(vDir)), 1.0); }`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(5000, 64, 32), mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;
  return { mesh, uniforms };
}
