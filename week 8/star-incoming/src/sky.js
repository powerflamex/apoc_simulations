// The sky with two suns and the Moon.
//   The Sun (uSun, angular radius uSunA): a small blazing golden disc, darker at the edge, with a glare that spreads
//   with its brightness. It shrinks after the pass (Earth flung away).
//   The star (uStar, uStarA): Gliese 710, an orange dwarf: a bigger orange disc, limb-darkened, boiling convection
//   cells and a few dark starspots that show once it's big (uGran), its own orange glare.
//   The Moon (uMoon): a small grey disc lit from uMoonL (a fat crescent), dimmed by daylight.
//   The sky: a gradient between uTop and uLow, warmed toward each sun near the horizon (uNearS, uNearX); a few
//   fair-weather clouds low down lit by both; faint stars when it's dark (uNight).
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
uniform vec3 uSun; uniform float uSunA; uniform vec3 uSunCol; uniform float uSunI; uniform float uSunG; uniform vec3 uSunGC;
uniform vec3 uStar; uniform float uStarA; uniform vec3 uStarCol; uniform float uStarI; uniform float uStarG; uniform vec3 uStarGC; uniform float uGran;
uniform vec3 uMoon; uniform vec3 uMoonL; uniform float uMoonI;
uniform float uPx; uniform float uT;
uniform vec3 uTop; uniform vec3 uLow; uniform vec3 uNearS; uniform vec3 uNearX; uniform float uNight; uniform float uCloud; uniform float uDrift;
float hash13(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
float noise3(vec3 p) { vec3 i = floor(p); vec3 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash13(i), hash13(i + vec3(1,0,0)), f.x), mix(hash13(i + vec3(0,1,0)), hash13(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(hash13(i + vec3(0,0,1)), hash13(i + vec3(1,0,1)), f.x), mix(hash13(i + vec3(0,1,1)), hash13(i + vec3(1,1,1)), f.x), f.y), f.z); }
float fbm3(vec3 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * noise3(p); p = p * 2.03 + 7.1; a *= 0.5; } return s; }
float fbm4(vec3 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++) { s += a * noise3(p); p = p * 2.11 + 3.3; a *= 0.5; } return s; }

// a disc of angular radius R around direction d: returns (coverage, q.x, q.y, |q|) with q = position on the disc (|q| = 1 at the rim)
vec4 disc(vec3 v, vec3 d, float R) {
  float cs = dot(v, d);
  float ang = acos(clamp(cs, -1.0, 1.0));
  // (for tiny angles acos loses precision: use the cross product)
  float s = length(cross(v, d));
  ang = cs > 0.9999 ? asin(clamp(s, 0.0, 1.0)) : ang;
  vec3 e1 = normalize(cross(d, vec3(0.0, 1.0, 0.0)));
  vec3 e2 = cross(e1, d);
  vec3 vp = v - d * cs;
  float lp = length(vp);
  vec2 dir2 = lp > 1e-7 ? vec2(dot(vp, e1), dot(vp, e2)) / lp : vec2(1.0, 0.0);
  float Rs = max(R, uPx * 1.2);
  float edgeW = max(uPx * 1.2 / Rs, 0.003);
  float rq = ang / Rs;
  float inside = 1.0 - smoothstep(1.0 - edgeW, 1.0 + edgeW, rq);
  return vec4(inside, dir2 * rq, rq);
}

void main() {
  vec3 v = normalize(vDir);
  float h = v.y;
  float hh = clamp(h, 0.0, 1.0);
  // ---------- the sky ----------
  vec3 c = mix(uLow, uTop, pow(smoothstep(0.0, 0.34, hh), 0.62));
  // warmer toward each sun, low down
  float aS = max(dot(normalize(vec3(v.x, 0.0, v.z) + 1e-5), normalize(vec3(uSun.x, 0.0, uSun.z))), 0.0);
  float aX = max(dot(normalize(vec3(v.x, 0.0, v.z) + 1e-5), normalize(vec3(uStar.x, 0.0, uStar.z))), 0.0);
  float lowK = 1.0 - smoothstep(0.0, 0.42, hh);
  c = mix(c, uNearS, pow(aS, 5.0) * lowK);
  c += uNearX * pow(aX, 4.0) * (1.0 - smoothstep(0.0, 0.6, hh)) * 0.8;
  // faint stars when it's dark
  if (uNight > 0.0 && h > 0.0) {
    vec3 q = v * 260.0;
    vec3 cell = floor(q);
    float st = hash13(cell);
    vec3 pp = fract(q) - 0.5 - (vec3(hash13(cell + 1.7), hash13(cell + 3.1), hash13(cell + 5.3)) - 0.5) * 0.6;
    float star = step(0.988, st) * exp(-dot(pp, pp) * 90.0) * (0.4 + 2.0 * (st - 0.988) / 0.012);
    c += vec3(0.9, 0.92, 1.0) * star * uNight * 0.6 * smoothstep(0.04, 0.3, h);
  }
  // fair-weather clouds low down, lit from behind by both suns
  if (h > 0.0 && uCloud > 0.0) {
    float dist = 2200.0 / max(h, 0.035);
    vec2 p = v.xz * dist + vec2(uDrift, uDrift * 0.3);
    float n = fbm3(vec3(p / 1700.0, 2.0));
    float cov = smoothstep(0.58, 0.76, n) * 0.75 * (1.0 - smoothstep(16000.0, 50000.0, dist)) * uCloud;
    vec3 cc = uLow * 0.9 + uNearS * 1.3 * pow(max(dot(v, uSun), 0.0), 6.0) + uNearX * 1.1 * pow(max(dot(v, uStar), 0.0), 5.0);
    cc *= 0.7 + 0.35 * fbm3(vec3(p / 420.0, 5.0));
    c = mix(c, cc, cov * 0.85);
  }
  // ---------- the glares ----------
  float oS = max(acos(clamp(dot(v, uSun), -1.0, 1.0)) - uSunA, 0.0);
  float oX = max(acos(clamp(dot(v, uStar), -1.0, 1.0)) - uStarA, 0.0);
  // (kept tight: a wide glare pushes the sky over the bloom threshold and reads as a huge white disc)
  c += uSunGC * uSunG * (exp(-oS / 0.0022) * 1.1 + exp(-oS / 0.012) * 0.22 + exp(-oS / 0.08) * 0.05);
  c += uStarGC * uStarG * (exp(-oX / 0.003) * 0.7 + exp(-oX / 0.014) * 0.38 + exp(-oX / 0.1) * 0.08);
  // ---------- the Moon ----------
  if (uMoonI > 0.0) {
    vec4 m = disc(v, uMoon, 0.0045);
    if (m.x > 0.0) {
      vec2 q = m.yz;
      float z = sqrt(max(0.0, 1.0 - dot(q, q)));
      vec3 e1 = normalize(cross(uMoon, vec3(0.0, 1.0, 0.0))), e2 = cross(e1, uMoon);
      vec3 n = normalize(e1 * q.x + e2 * q.y - uMoon * z);          // the Moon's surface normal, toward you
      // lit from behind by the star (a crescent on its side) plus earthshine on the rest
      float lit = smoothstep(-0.02, 0.1, dot(n, uMoonL));
      float maria = smoothstep(0.45, 0.7, fbm4(vec3(q * 3.0, 1.0)));
      vec3 mc = vec3(0.92, 0.92, 0.9) * (1.0 - 0.3 * maria) * (0.5 + 0.5 * z);
      vec3 lc = mc * vec3(1.0, 0.72, 0.5) * lit * 1.4 + mc * vec3(0.55, 0.6, 0.72) * 0.16 * (1.0 - lit);
      c = mix(c, c * 0.35 + lc * uMoonI, m.x);
    }
  }
  // ---------- the star ----------
  {
    vec4 d = disc(v, uStar, uStarA);
    if (d.x > 0.0) {
      vec2 q = d.yz;
      float r = min(d.w, 1.0);
      float mu = sqrt(max(0.0, 1.0 - r * r));
      float limb = 0.5 + 0.5 * pow(mu, 0.5);
      vec3 sc = uStarCol * limb;
      if (uGran > 0.0) {
        float cells = fbm3(vec3(q * 9.0 / (0.45 + 0.55 * mu), uT * 0.12));
        float fine = fbm4(vec3(q * 23.0 + 3.0, uT * 0.25));
        float pat = clamp((cells - 0.35) * 1.5 + (fine - 0.5) * 0.6 + 0.2, 0.0, 1.0);
        vec3 g = mix(uStarCol * vec3(0.78, 0.6, 0.5), uStarCol * vec3(1.1, 1.08, 1.05), pat * pat * (3.0 - 2.0 * pat)) * limb;
        // starspots: a few dark umbrae with lighter rims
        float sp = 0.0;
        sp += 1.0 - smoothstep(0.07, 0.12, length(q - vec2(-0.32, 0.18)));
        sp += 1.0 - smoothstep(0.045, 0.08, length(q - vec2(-0.2, 0.26)));
        sp += 1.0 - smoothstep(0.05, 0.09, length(q - vec2(0.38, -0.3)));
        float pen = 0.0;
        pen += 1.0 - smoothstep(0.12, 0.17, length(q - vec2(-0.32, 0.18)));
        pen += 1.0 - smoothstep(0.08, 0.12, length(q - vec2(-0.2, 0.26)));
        pen += 1.0 - smoothstep(0.09, 0.13, length(q - vec2(0.38, -0.3)));
        g *= 1.0 - 0.2 * clamp(pen, 0.0, 1.0) - 0.3 * clamp(sp, 0.0, 1.0);
        sc = mix(sc, g, uGran);
      }
      c = mix(c, sc * uStarI, d.x);
    }
  }
  // ---------- the Sun ----------
  {
    vec4 d = disc(v, uSun, uSunA);
    if (d.x > 0.0) {
      float r = min(d.w, 1.0);
      float mu = sqrt(max(0.0, 1.0 - r * r));
      vec3 sc = uSunCol * (0.45 + 0.55 * pow(mu, 0.5));
      c = mix(c, sc * uSunI, d.x);
    }
  }
  // below the horizon: the sea covers it, but keep it dark-ish where the sea fades
  c = mix(c, uLow * 0.6, smoothstep(0.0, -0.04, h));
  gl_FragColor = vec4(clamp(c, 0.0, 60.0), 1.0);
}`;

export function makeSky() {
  const V = (x, y, z) => ({ value: new THREE.Vector3(x, y, z) });
  const C = (r, g, b) => ({ value: new THREE.Color(r, g, b) });
  const uniforms = {
    uSun: V(-1, 0.05, 0), uSunA: { value: 0.00466 }, uSunCol: C(1, 0.8, 0.5), uSunI: { value: 8 }, uSunG: { value: 0.5 }, uSunGC: C(1, 0.7, 0.4),
    uStar: V(-1, 0.2, 0.1), uStarA: { value: 0.006 }, uStarCol: C(1, 0.5, 0.2), uStarI: { value: 3 }, uStarG: { value: 0.4 }, uStarGC: C(1, 0.5, 0.25), uGran: { value: 1 },
    uMoon: V(-1, 0.3, -0.1), uMoonL: V(0, 0, 1), uMoonI: { value: 0 },
    uPx: { value: 0.0006 }, uT: { value: 0 },
    uTop: C(0.1, 0.3, 0.7), uLow: C(0.8, 0.75, 0.7), uNearS: C(1, 0.75, 0.5), uNearX: C(0.5, 0.25, 0.1), uNight: { value: 0 }, uCloud: { value: 1 }, uDrift: { value: 0 },
  };
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1000, 64, 32), new THREE.ShaderMaterial({ uniforms, vertexShader: vert, fragmentShader: frag, side: THREE.BackSide, depthWrite: false, depthTest: false }));
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;
  return { mesh, uniforms };
}
