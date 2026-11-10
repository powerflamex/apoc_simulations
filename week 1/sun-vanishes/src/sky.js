// Sky for "the Sun vanishes": late-afternoon daylight, a sun disk that goes dark centre-first,
// then a night sky that turns around the celestial pole as days pass (continuous star trails),
// with planets that keep glowing a little while on old sunlight.
import * as THREE from 'three';

export const SKY_COMMON = /* glsl */ `
uniform float uDay;
uniform vec3 uSunDir;
uniform float uCity;
vec3 atmosphere(vec3 v) {
  float e = v.y;
  float h = clamp(e, 0.0, 1.0);
  float cs = max(dot(v, uSunDir), 0.0);
  vec3 zen = vec3(0.045, 0.14, 0.42);
  vec3 hor = vec3(0.46, 0.58, 0.74);
  vec3 day = mix(hor, zen, pow(h, 0.45));
  day += vec3(1.0, 0.82, 0.55) * (pow(cs, 8.0) * 0.07 + pow(cs, 64.0) * 0.18 + pow(cs, 900.0) * 0.9);
  day += vec3(0.35, 0.16, 0.03) * exp(-h * 9.0) * pow(cs, 1.5);
  vec3 night = vec3(0.0025, 0.0035, 0.008) + vec3(0.06, 0.035, 0.018) * uCity * exp(-max(e, 0.0) * 14.0);
  vec3 c = mix(night, day, uDay);
  if (e < 0.0) c = mix(c, mix(night, vec3(0.42, 0.5, 0.62), uDay) * 0.6, smoothstep(0.0, -0.08, e));
  return c;
}
`;

const vert = /* glsl */ `
varying vec3 vDir;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vDir = wp.xyz - cameraPosition;
  gl_Position = projectionMatrix * viewMatrix * wp;
  gl_Position.z = gl_Position.w;   // exactly on the far plane (see makeSky)
}
`;

const frag = /* glsl */ `
precision highp float;
varying vec3 vDir;
uniform float uTime;
uniform float uSunCore;
uniform float uStarVis;
uniform float uRot;
uniform float uTrail;
uniform vec3 uPole;
uniform vec3 uPlanetA; uniform vec3 uPlanetB; uniform vec3 uPlanetC;
uniform vec3 uPlanetVis;
uniform float uPx;
uniform float uSnowHaze;
${SKY_COMMON}

float h11(float x) { return fract(sin(x * 127.1) * 43758.5453); }
float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float hash13(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
float noise3(vec3 p) {
  vec3 i = floor(p); vec3 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash13(i), hash13(i + vec3(1,0,0)), f.x), mix(hash13(i + vec3(0,1,0)), hash13(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(hash13(i + vec3(0,0,1)), hash13(i + vec3(1,0,1)), f.x), mix(hash13(i + vec3(0,1,1)), hash13(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float fbm3(vec3 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++) { s += a * noise3(p); p = p * 2.03 + 7.1; a *= 0.5; } return s; }

vec3 rotAxis(vec3 v, vec3 k, float a) { // Rodrigues
  float c = cos(a), s = sin(a);
  return v * c + cross(k, v) * s + k * dot(k, v) * (1.0 - c);
}

// stars on thin rings around the pole: a trail is just an arc of its ring, so any exposure length is exact
vec3 starTrails(vec3 d) {
  vec3 E1 = normalize(cross(uPole, vec3(0.0, 0.0, 1.0)));
  vec3 E2 = cross(uPole, E1);
  float psi = acos(clamp(dot(d, uPole), -1.0, 1.0));
  float phi = atan(dot(d, E2), dot(d, E1));
  const float RING = 0.0018;
  float fi = psi / RING;
  float ri = floor(fi);
  float w = uPx * 0.62;
  vec3 col = vec3(0.0);
  float W = uTrail;
  for (int dr = -1; dr <= 1; dr++) {
    float ring = ri + float(dr);
    float psiC = (ring + 0.5) * RING;
    float perp = psi - psiC;
    if (abs(perp) > 3.0 * w) continue;
    float sp = sin(psiC);
    float hr = h11(ring * 0.731 + 3.1);
    int n = int(floor(pow(hr, 0.8) * 7.0 * sp + 0.35));
    for (int k = 0; k < 7; k++) {
      if (k >= n) break;
      float hk = h11(ring * 1.37 + float(k) * 19.13);
      float phiK = hk * 6.2831853;
      float rel = mod(phi - phiK + uRot, 6.2831853);
      float along = rel <= W ? 0.0 : min(rel - W, 6.2831853 - rel);
      along *= sp;
      float b = h11(ring * 2.9 + float(k) * 7.7);
      float bright = 0.12 + 3.6 * pow(b, 7.0);
      float trailK = smoothstep(0.0, 0.5, W);
      // in the long exposure: many trails, mostly faint with a few bright ones (like a real star-trail photo)
      float tb = smoothstep(0.87, 0.995, b);
      bright = mix(bright, (0.035 + 1.05 * tb * tb * tb) * step(0.87, b), trailK);
      if (bright <= 0.0) continue;
      // each trail fades away behind its star, so the sweep reads as motion
      float fade = rel <= W ? mix(1.0, 0.25 + 0.75 * exp(-2.0 * rel / max(W, 1e-3)), trailK) : 1.0;
      float ww = w * (1.0 + 0.45 * tb * trailK);
      float g = exp(-(perp * perp + along * along) / (ww * ww)) * fade;
      vec3 tint = mix(vec3(0.6, 0.74, 1.0), vec3(1.0, 0.76, 0.5), h11(ring + float(k) * 3.3));
      col += tint * bright * g;
    }
  }
  return col;
}

vec3 milkyWay(vec3 d) {
  vec3 n = normalize(vec3(-0.35, 0.55, 0.75));
  vec3 acc = vec3(0.0);
  int N = uTrail > 0.01 ? 8 : 1;
  for (int i = 0; i < 8; i++) {
    if (i >= N) break;
    float a = uRot - uTrail * float(i) / 7.0;
    vec3 q = rotAxis(d, uPole, N == 1 ? uRot : a);
    float band = exp(-pow(dot(q, n) / 0.19, 2.0));
    float f = fbm3(q * 5.0);
    float dust = smoothstep(0.45, 0.75, fbm3(q * 11.0 + 3.0));
    acc += mix(vec3(0.55, 0.6, 0.8), vec3(0.95, 0.82, 0.68), f) * band * (0.25 + 0.75 * f) * (1.0 - 0.65 * dust * band);
  }
  return acc / float(N) * 0.04;
}

vec3 planet(vec3 d, vec3 p, float vis, vec3 tint, float bright) {
  if (vis <= 0.0) return vec3(0.0);
  vec3 q = rotAxis(p, uPole, -uRot);
  float a = length(d - q);
  float w = uPx * 1.1;
  return tint * vis * bright * (exp(-a * a / (w * w)) + 0.05 * exp(-a / (w * 6.0)));
}

void main() {
  vec3 v = normalize(vDir);
  vec3 c = atmosphere(v);
  float cloud = 0.0;
  if (v.y > 0.0) {
    vec2 cp = v.xz / (v.y + 0.06) * 1.6 + vec2(uTime * 0.01, 0.0);
    float cn = fbm3(vec3(cp * 1.4, 2.0));
    cloud = smoothstep(0.52, 0.72, cn) * smoothstep(0.0, 0.08, v.y) * (1.0 - smoothstep(0.35, 0.8, v.y));
    float lit = 0.6 + 0.4 * pow(max(dot(v, uSunDir), 0.0), 4.0);
    vec3 cc = mix(vec3(0.62, 0.66, 0.74), vec3(1.0, 0.94, 0.84), lit) * uDay + vec3(0.004, 0.005, 0.008) * (1.0 - uDay);
    c = mix(c, cc, cloud * 0.8);
  }

  // the sun: centre goes dark first, then the edge (light from the limb is 2.3 s further away)
  float ang = acos(clamp(dot(v, uSunDir), -1.0, 1.0));
  const float SR = 0.0105;
  if (ang < SR * 1.05) {
    float r = ang / SR;
    float aa = uPx * 1.2 / SR;
    float disk = (1.0 - smoothstep(1.0 - aa, 1.0 + aa, r)) * smoothstep(uSunCore - aa, uSunCore + aa, r);
    if (uSunCore >= 0.999) disk = 0.0;
    float limb = 0.55 + 0.45 * sqrt(max(1.0 - r * r, 0.0));
    c += vec3(1.0, 0.93, 0.8) * disk * limb * 16.0;
  }

  // night sky
  float sv = uStarVis * smoothstep(-0.02, 0.06, v.y);
  if (sv > 0.0) {
    vec3 sky = starTrails(v) + milkyWay(v);
    sky += planet(v, uPlanetA, uPlanetVis.x, vec3(1.0, 0.97, 0.9), 9.0);   // venus
    sky += planet(v, uPlanetB, uPlanetVis.y, vec3(1.0, 0.92, 0.78), 5.0);  // jupiter
    sky += planet(v, uPlanetC, uPlanetVis.z, vec3(1.0, 0.88, 0.66), 2.6);  // saturn
    c += sky * sv * (1.0 - 0.6 * uSnowHaze) * (1.0 - 0.9 * cloud);
  }
  if (any(isnan(c)) || any(isinf(c))) c = vec3(0.0);
  gl_FragColor = vec4(clamp(c, 0.0, 60.0), 1.0);
}
`;

export function makeSky() {
  const uniforms = {
    uTime: { value: 0 },
    uDay: { value: 1 },
    uCity: { value: 0 },
    uSunCore: { value: 0 },
    uSunDir: { value: new THREE.Vector3() },
    uStarVis: { value: 0 },
    uRot: { value: 0 },
    uTrail: { value: 0 },
    uPole: { value: new THREE.Vector3() },
    uPlanetA: { value: new THREE.Vector3() },
    uPlanetB: { value: new THREE.Vector3() },
    uPlanetC: { value: new THREE.Vector3() },
    uPlanetVis: { value: new THREE.Vector3(1, 1, 1) },
    uPx: { value: 0.0006 },
    uSnowHaze: { value: 0 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms, vertexShader: vert, fragmentShader: frag,
    side: THREE.BackSide, depthWrite: false, depthTest: true,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1000, 64, 32), mat);
  mesh.frustumCulled = false;
  // Drawn after every other opaque object, depth-tested at the far plane: the sky shader then only runs where sky
  // is actually visible, instead of on the whole frame before the world is drawn over it. Transparent objects
  // still come after it, so the picture is the same. (Needs every other opaque object to write and test depth.)
  mesh.renderOrder = 1000;
  return { mesh, uniforms };
}
