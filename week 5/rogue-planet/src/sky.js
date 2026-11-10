// The sky over the crossing: the night (deep blue overhead, the city's orange glow low down, a few stars that wheel
// round the pole as the time-lapse runs), the rogue planet and the Moon, all worked out per pixel from where they
// really are:
//   - the planet: a sphere of Jupiter's radius at distance D (ray traced: its real size and shape from any distance),
//     lit by the Sun from below the horizon (soft terminator, limb darkening, a hazy blue rim), banded clouds that
//     flow in jets and turn once every ~10 hours, a great storm, white ovals and small eddies that sharpen as it nears;
//   - the Moon: lit by the same Sun; stretched toward the planet as it nears it, then torn into pieces; the hit is a
//     flash on the planet's face, a fireball and a ring spreading over its clouds;
//   - the air lit by the planet: the night sky turns a deep glowing blue, with a pale halo round the disc;
//   - the volcanoes' glow low in the north at the end; dawn just starting in the east.
// A dome that follows the camera, drawn first.
import * as THREE from 'three';

export const PLANET_GLSL = /* glsl */ `
  float h13(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
  float n3(vec3 p) { vec3 i = floor(p); vec3 f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(h13(i), h13(i + vec3(1,0,0)), f.x), mix(h13(i + vec3(0,1,0)), h13(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(h13(i + vec3(0,0,1)), h13(i + vec3(1,0,1)), f.x), mix(h13(i + vec3(0,1,1)), h13(i + vec3(1,1,1)), f.x), f.y), f.z); }
  float fbm(vec3 p, int oct) { float a = 0.5, s = 0.0; for (int i = 0; i < 7; i++) { if (i >= oct) break; s += a * n3(p); p = p * 2.03 + 1.7; a *= 0.5; } return s; }
  // the clouds at planet-frame direction q (z: the spin axis); rot: how far it has turned (rad); det: 0..1 fine detail
  uniform float uStorm;
  vec3 planetClouds(vec3 q, float rot, float det, float t) {
    float lat = asin(clamp(q.z, -1.0, 1.0));
    // zonal jets: neighbouring bands drift against each other
    float jet = sin(lat * 11.0) * 0.16 + sin(lat * 23.0 + 1.3) * 0.05;
    float lon = atan(q.y, q.x) + rot * (1.0 + jet);
    vec3 p = vec3(cos(lat) * cos(lon), cos(lat) * sin(lon), sin(lat));
    int oct = 4 + int(det * 3.0);
    float w1 = fbm(p * 3.0 + vec3(0.0, 0.0, t * 0.01), oct);
    float w2 = fbm(p * 9.0 + vec3(5.2, 1.3, 0.0) + w1 * 1.5, oct);
    float lt = lat + 0.07 * (w1 - 0.5) + 0.035 * (w2 - 0.5);
    float b = sin(lt * 21.0 + 0.8 * sin(lt * 4.0));
    float b2 = sin(lt * 37.0 + 2.0);
    vec3 cream = vec3(0.95, 0.87, 0.72), tan_ = vec3(0.76, 0.53, 0.33), rust = vec3(0.56, 0.26, 0.13), dark = vec3(0.24, 0.13, 0.08);
    vec3 c = mix(tan_, cream, smoothstep(-0.2, 0.6, b));
    c = mix(c, rust, smoothstep(0.3, 0.9, -b) * 0.9);
    c = mix(c, dark, smoothstep(0.75, 1.0, -b) * smoothstep(0.2, 0.8, b2) * 0.6);
    c *= 0.85 + 0.3 * w2;
    // the poles: blue-grey and mottled
    float pol = smoothstep(0.85, 1.25, abs(lat));
    c = mix(c, vec3(0.42, 0.44, 0.48) * (0.7 + 0.5 * w2), pol);
    // eddies and festoons along the band edges (more of them as it gets closer)
    float edge = 1.0 - abs(b);
    float ed = fbm(p * 26.0 + w2 * 2.0, oct);
    c = mix(c, cream * 1.05, smoothstep(0.62, 0.8, ed) * edge * 0.7);
    c = mix(c, dark * 0.8, smoothstep(0.66, 0.84, fbm(p * 41.0 - w1 * 3.0, oct)) * edge * 0.45 * det);
    // the great storm: a swirling red oval south of the equator, and a few white ovals
    vec2 sc = vec2(lon - uStorm, lat + 0.36);
    sc.x = mod(sc.x + 3.14159, 6.28318) - 3.14159;
    float sr = length(sc * vec2(0.55, 1.25)) / 0.16;
    float sw = atan(sc.y, sc.x) + 3.0 * exp(-sr) + w2 * 2.0;
    float swirl = 0.5 + 0.5 * sin(sw * 3.0 + sr * 9.0);
    c = mix(c, mix(vec3(0.75, 0.3, 0.16), vec3(0.95, 0.62, 0.4), swirl * 0.6), smoothstep(1.0, 0.75, sr));
    c = mix(c, cream * 1.08, smoothstep(0.12, 0.0, abs(sr - 1.05)) * 0.7);
    for (int k = 0; k < 4; k++) {
      float fk = float(k);
      vec2 oc = vec2(lon - 2.3 - fk * 1.4, lat - (-0.62 + fk * 0.08));
      oc.x = mod(oc.x + 3.14159, 6.28318) - 3.14159;
      float orr = length(oc * vec2(0.7, 1.2)) / 0.045;
      c = mix(c, vec3(0.97, 0.95, 0.9), smoothstep(1.0, 0.6, orr));
    }
    // a little richer than life, so the bands read on a phone
    float lum = dot(c, vec3(0.3, 0.55, 0.15));
    return max(mix(vec3(lum), c, 1.3), 0.0);
  }
`;

export function makeSky() {
  const uniforms = {
    uPx: { value: 0.001 }, uTime: { value: 0 },
    uPDir: { value: new THREE.Vector3(0, 0.5, -0.8) }, uPD: { value: 18 }, uSun: { value: new THREE.Vector3(0, -1, 0) },
    uAxis: { value: new THREE.Vector3(0, 1, 0) }, uAxX: { value: new THREE.Vector3(1, 0, 0) }, uRot: { value: 0 }, uDet: { value: 0 },
    uMoonDir: { value: new THREE.Vector3(0, 0.5, -0.8) }, uMoonAng: { value: 0.0045 }, uMoonOn: { value: 1 },
    uMoonTo: { value: new THREE.Vector3(1, 0, 0) }, uMoonStr: { value: 0 }, uMoonBrk: { value: 0 },
    uHitDir: { value: new THREE.Vector3(0, 1, 0) }, uHitAge: { value: -1 },
    uSkyLit: { value: 0 }, uCity: { value: 1 }, uVolc: { value: 0 }, uDawn: { value: 0 },
    uStar: { value: new THREE.Matrix3() }, uPlanetK: { value: 1 }, uStorm: { value: 1.1 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms, side: THREE.BackSide, depthWrite: false, depthTest: true,
    vertexShader: /* glsl */ `varying vec3 vD; void main(){ vD = position; gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0); gl_Position.z = gl_Position.w; }`,
    fragmentShader: /* glsl */ `
      uniform float uPx; uniform float uTime;
      uniform vec3 uPDir; uniform float uPD; uniform vec3 uSun; uniform vec3 uAxis; uniform vec3 uAxX; uniform float uRot; uniform float uDet;
      uniform vec3 uMoonDir; uniform float uMoonAng; uniform float uMoonOn; uniform vec3 uMoonTo; uniform float uMoonStr; uniform float uMoonBrk;
      uniform vec3 uHitDir; uniform float uHitAge;
      uniform float uSkyLit; uniform float uCity; uniform float uVolc; uniform float uDawn; uniform mat3 uStar; uniform float uPlanetK;
      varying vec3 vD;
      ${PLANET_GLSL}
      vec3 stars(vec3 d) {
        vec3 s = vec3(0.0);
        for (int k = 0; k < 2; k++) {
          float sc = k == 0 ? 120.0 : 260.0;
          vec3 p = d * sc; vec3 i = floor(p);
          float h = h13(i + float(k) * 13.1);
          if (h > 0.965) {
            vec3 c = i + 0.5 + (vec3(h13(i + 1.3), h13(i + 2.7), h13(i + 4.1)) - 0.5) * 0.7;
            float dd = length(p - c) / sc;
            float b = pow(h13(i + 9.9), 4.0) * 3.0 + 0.2;
            s += mix(vec3(1.0, 0.85, 0.7), vec3(0.75, 0.85, 1.0), h13(i + 5.5)) * b * exp(-dd * dd / (uPx * uPx * 0.8));
          }
        }
        return s;
      }
      // the Moon (or its pieces) at view direction r: returns colour in rgb, coverage in a
      vec4 moon(vec3 r) {
        if (uMoonOn < 0.5) return vec4(0.0);
        float cs = dot(r, uMoonDir);
        float reach = uMoonAng * (1.0 + 6.0 * uMoonStr + 14.0 * uMoonBrk);
        if (cs < cos(reach * 1.5)) return vec4(0.0);
        vec3 ta = normalize(uMoonTo - uMoonDir * dot(uMoonTo, uMoonDir));
        vec3 tb = cross(uMoonDir, ta);
        vec3 o = (r - uMoonDir * cs) / uMoonAng;
        vec2 xy = vec2(dot(o, ta), dot(o, tb));
        float aa = uPx / uMoonAng;
        vec4 res = vec4(0.0);
        // whole (stretched along the line to the planet) or in pieces strung out along it
        int nk = uMoonBrk > 0.0 ? 14 : 1;
        for (int k = 0; k < 14; k++) {
          if (k >= nk) break;
          float fk = float(k);
          vec2 c = vec2(0.0); float rr = 1.0;
          vec2 sq = vec2(1.0 + 2.2 * uMoonStr, 1.0 - 0.25 * uMoonStr);
          if (nk > 1) {
            float u = h13(vec3(fk, 1.0, 7.0)) * 2.0 - 1.0;
            c = vec2(u * (1.0 + 2.2 * uMoonStr) * (1.0 + 11.0 * uMoonBrk) + 9.0 * uMoonBrk * uMoonBrk, (h13(vec3(fk, 3.0, 2.0)) - 0.5) * 0.9 * (1.0 + 2.0 * uMoonBrk));
            rr = (0.22 + 0.32 * h13(vec3(fk, 5.0, 1.0))) * (k == 0 ? 1.6 : 1.0);
            sq = vec2(1.0 + 0.6 * uMoonBrk, 1.0);
          }
          vec2 q = (xy - c) / (sq * rr);
          float l = length(q);
          float cov = 1.0 - smoothstep(1.0 - aa / rr, 1.0 + aa / rr, l);
          if (cov <= 0.0) continue;
          float z = sqrt(max(0.0, 1.0 - l * l));
          vec3 N = normalize(q.x * ta + q.y * tb - z * uMoonDir);
          float mu = dot(N, uSun);
          float mar = n3(vec3(q * 2.5 + fk * 3.0, 1.0)) * 0.6 + n3(vec3(q * 7.0, fk)) * 0.4;
          vec3 alb = vec3(0.42, 0.41, 0.4) * (0.65 + 0.5 * smoothstep(0.35, 0.65, mar));
          vec3 col = alb * smoothstep(-0.05, 0.2, mu) * (0.3 + 0.9 * max(mu, 0.0)) * 3.2;
          col += vec3(1.6, 0.6, 0.2) * uMoonBrk * 0.6 * (1.0 - z * 0.5);    // the torn faces glow
          res.rgb = mix(res.rgb, col, cov);
          res.a = max(res.a, cov);
        }
        return res;
      }
      void main() {
        vec3 r = normalize(vD);
        float h = r.y;
        // ---- the air: night, the city glow, lit more and more by the planet ----
        vec3 top = vec3(0.010, 0.014, 0.038), mid = vec3(0.05, 0.035, 0.075);
        vec3 low = vec3(0.36, 0.17, 0.12) * uCity + vec3(0.05, 0.035, 0.05);
        vec3 c = mix(low, mid, smoothstep(0.0, 0.14, h));
        c = mix(c, top, smoothstep(0.1, 0.6, h));
        float cosP = dot(r, uPDir);
        float ang = acos(clamp(cosP, -1.0, 1.0));
        float pa = asin(clamp(1.0 / uPD, 0.0, 1.0));
        float edgeD = max(ang - pa, 0.0);
        vec3 litSky = mix(vec3(0.16, 0.28, 0.62), vec3(0.42, 0.42, 0.5), smoothstep(0.25, 0.0, h)) * (0.55 + 0.45 * exp(-edgeD / 0.6));
        c += litSky * uSkyLit;
        c += vec3(0.95, 0.82, 0.62) * uSkyLit * 0.18 * exp(-edgeD / 0.04) + vec3(0.6, 0.62, 0.7) * uSkyLit * 0.12 * exp(-edgeD / 0.15);
        c += stars(uStar * r) * smoothstep(0.08, 0.35, h) * 0.45 * max(0.0, 1.0 - uSkyLit * 4.0);
        // dawn starting in the east; the volcanoes' glow low in the north
        c += vec3(0.35, 0.3, 0.45) * uDawn * exp(-max(h, 0.0) / 0.12) * smoothstep(0.0, 0.9, r.x);
        float north = smoothstep(0.2, 0.95, -r.z);
        float flick = 0.8 + 0.2 * sin(uTime * 7.0 + r.x * 30.0) * sin(uTime * 3.1 + r.x * 13.0);
        c += vec3(2.2, 0.5, 0.08) * uVolc * exp(-max(h, 0.0) / 0.07) * north * flick * (0.6 + 0.4 * n3(vec3(r.x * 24.0, 0.0, uTime * 0.3)));
        // ---- the planet ----
        float b = uPD * cosP;
        float disc = b * b - (uPD * uPD - 1.0);
        float pcov = 0.0;
        vec3 pc = vec3(0.0);
        if (disc > -0.05) {
          float sq = sqrt(max(disc, 0.0));
          float t = b - sq;
          vec3 P = r * t - uPDir * uPD;           // from its centre (radius 1)
          vec3 N = normalize(P);
          vec3 axY = cross(uAxis, uAxX);
          vec3 q = vec3(dot(N, uAxX), dot(N, axY), dot(N, uAxis));
          vec3 alb = planetClouds(q, uRot, uDet, uTime);
          float mu = dot(N, uSun);
          float mu0 = max(dot(N, -r), 0.0);
          float day = smoothstep(-0.06, 0.22, mu);
          vec3 col = alb * day * (0.2 + 0.9 * max(mu, 0.0)) * pow(mu0, 0.18) * 1.0;
          // the hazy rim, bluish on the sunlit side
          col += vec3(0.45, 0.58, 0.85) * pow(1.0 - mu0, 3.5) * smoothstep(-0.25, 0.35, mu) * 0.5;
          // the night side: very dark; lightning in the storms now and then
          col += alb * 0.012;
          // the Moon's hit: a flash, a fireball and a ring spreading over the clouds
          if (uHitAge >= 0.0 && uHitAge < 6.0) {
            float a = acos(clamp(dot(r, uHitDir), -1.0, 1.0)) / pa;
            float fb = exp(-uHitAge / 1.2);
            col += vec3(6.0, 4.0, 2.2) * exp(-a * a / (0.0016 + 0.012 * uHitAge)) * (0.4 + 2.0 * exp(-uHitAge / 0.25)) * (0.25 + 0.75 * fb);
            float rr = 0.06 + 0.13 * uHitAge;
            col += vec3(2.2, 1.3, 0.7) * exp(-pow((a - rr) / (0.012 + 0.01 * uHitAge), 2.0)) * fb * 1.2;
            col = mix(col, col * vec3(0.4, 0.3, 0.28), exp(-a * a / 0.002) * smoothstep(0.5, 2.0, uHitAge) * (1.0 - smoothstep(3.0, 5.0, uHitAge)) * 0.7);
          }
          // anti-aliased edge (in angle)
          float edgeA = ang - pa;
          pcov = 1.0 - smoothstep(-uPx * 0.7, uPx * 0.7, edgeA);
          if (disc < 0.0) pcov = 0.0;
          pc = col * uPlanetK;
        }
        c = mix(c, pc, pcov);
        vec4 m = moon(r);
        c = mix(c, m.rgb, m.a);
        // a soft glow round the Moon so it reads at phone size
        if (uMoonOn > 0.5) { float am = acos(clamp(dot(r, uMoonDir), -1.0, 1.0)); c += vec3(0.75, 0.78, 0.85) * 0.22 * exp(-am / (uMoonAng * 2.5)) * (1.0 - m.a); }
        // below the horizon (seen past the buildings' ends): the dark haze of the far city
        c = mix(c, low * 0.55 + vec3(0.02), smoothstep(0.0, -0.04, h));
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 32), mat);
  mesh.frustumCulled = false;
  // Drawn after every other opaque object, depth-tested at the far plane: the sky shader then only runs where sky
  // is actually visible, instead of on the whole frame before the world is drawn over it. Transparent objects
  // still come after it, so the picture is the same. (Needs every other opaque object to write and test depth.)
  mesh.renderOrder = 1000;
  return { mesh, uniforms };
}
