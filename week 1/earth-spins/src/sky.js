// Sky for "Earth spins faster": the tropical sky over Singapore in time-lapse. The Sun streaks across it
// (a short trail behind the disk, longer the faster the sky turns), sunsets and blue hours, a night of
// star trails around the pole (on the northern horizon here), the Moon and Venus, and fast-moving
// cumulus that catch the sunset and the city's glow.
import * as THREE from 'three';

// shared by the sky, the sea's reflections and the fog
export const SKY_COMMON = /* glsl */ `
uniform vec3 uSunDir;
uniform float uCity;
uniform float uWhite;
vec3 atmosphere(vec3 v) {
  float e = v.y;
  float h = clamp(e, 0.0, 1.0);
  float se = uSunDir.y;
  float cs = dot(v, uSunDir);
  vec2 hs = normalize(uSunDir.xz + vec2(1e-5));
  float side = dot(normalize(v.xz + vec2(1e-5)), hs) * 0.5 + 0.5;
  // day: deep tropical blue overhead, paler near the horizon, a tight halo round the Sun;
  // when the Sun is low the whole horizon on its side turns gold (golden hour)
  vec3 day = mix(vec3(0.5, 0.64, 0.82), vec3(0.04, 0.17, 0.52), pow(h, 0.4));
  float gold = 1.0 - smoothstep(0.04, 0.4, se);
  vec3 goldHor = mix(vec3(0.55, 0.5, 0.62), vec3(1.0, 0.62, 0.3), pow(side, 1.6));
  day = mix(day, mix(goldHor, day, smoothstep(0.0, 0.35, h)), gold * 0.85);
  day += vec3(1.0, 0.72, 0.42) * (pow(max(cs, 0.0), 24.0) * 0.16 * (0.5 + gold) + pow(max(cs, 0.0), 500.0) * 0.5);
  // sunset / blue hour: orange and red along the horizon on the Sun's side, violet on the other, deep blue above
  vec3 twHor = mix(vec3(0.34, 0.24, 0.42), vec3(1.0, 0.42, 0.13), pow(side, 2.2));
  vec3 tw = mix(twHor, vec3(0.08, 0.1, 0.27), pow(smoothstep(0.0, 0.55, h), 0.55));
  tw += vec3(1.0, 0.5, 0.2) * pow(max(cs, 0.0), 5.0) * 0.55 * smoothstep(-0.12, 0.02, se);
  // night: dark navy with the city's orange glow on the low sky
  vec3 night = mix(vec3(0.026, 0.034, 0.075), vec3(0.008, 0.012, 0.034), pow(h, 0.5));
  night += vec3(0.16, 0.085, 0.035) * uCity * exp(-max(e, 0.0) * 9.0);
  float twK = smoothstep(-0.22, -0.02, se);       // night -> twilight
  float dayK = smoothstep(-0.01, 0.3, se);        // twilight -> day
  vec3 c = mix(night, tw * mix(0.35, 1.0, smoothstep(-0.16, 0.0, se)), twK);
  c = mix(c, day, dayK);
  if (e < 0.0) c = mix(c, c * 0.55, smoothstep(0.0, -0.08, e));
  // inside the cloud at the end everything goes milky white
  c = mix(c, vec3(0.92, 0.92, 0.9) * (0.35 + 0.75 * smoothstep(-0.2, 0.2, se)), uWhite);
  return c;
}
`;

const vert = /* glsl */ `
varying vec3 vDir;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vDir = wp.xyz - cameraPosition;
  gl_Position = projectionMatrix * viewMatrix * wp;
  gl_Position.z = gl_Position.w * 0.99999;
}
`;

const frag = /* glsl */ `
precision highp float;
varying vec3 vDir;
uniform float uTime;
uniform float uPx;
uniform vec3 uSunPrev;      // where the Sun was a moment ago (the streak)
uniform vec3 uMoonDir;
uniform vec3 uVenusDir;
uniform vec3 uPole;
uniform float uRot;          // sky rotation (radians)
uniform float uTrail;        // star-trail arc (radians)
uniform float uCloudH;       // height of the cloud base above the camera (m)
uniform vec2 uCloudOff;
uniform float uCloudMorph;
uniform vec2 uCloudBlur;     // cloud motion smear (in cloud-plane units)
uniform float uCloudCover;
${SKY_COMMON}

float h11(float x) { return fract(sin(x * 127.1) * 43758.5453); }
float hash13(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
float noise3(vec3 p) {
  vec3 i = floor(p); vec3 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash13(i), hash13(i + vec3(1,0,0)), f.x), mix(hash13(i + vec3(0,1,0)), hash13(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(hash13(i + vec3(0,0,1)), hash13(i + vec3(1,0,1)), f.x), mix(hash13(i + vec3(0,1,1)), hash13(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float fbm3(vec3 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * noise3(p); p = p * 2.03 + 7.1; a *= 0.5; } return s; }
vec3 rotAxis(vec3 v, vec3 k, float a) { float c = cos(a), s = sin(a); return v * c + cross(k, v) * s + k * dot(k, v) * (1.0 - c); }

// stars on thin rings around the pole: a trail is an arc of its ring, so any exposure is exact
vec3 starTrails(vec3 d) {
  vec3 E1 = normalize(cross(uPole, vec3(0.0, 0.0, 1.0)));
  vec3 E2 = cross(uPole, E1);
  float psi = acos(clamp(dot(d, uPole), -1.0, 1.0));
  float phi = atan(dot(d, E2), dot(d, E1));
  const float RING = 0.0019;
  float ri = floor(psi / RING);
  float w = uPx * 0.7;
  vec3 col = vec3(0.0);
  float W = uTrail;
  for (int dr = -1; dr <= 1; dr++) {
    float ring = ri + float(dr);
    float psiC = (ring + 0.5) * RING;
    float perp = psi - psiC;
    if (abs(perp) > 3.0 * w) continue;
    float sp = sin(psiC);
    float hr = h11(ring * 0.731 + 3.1);
    int n = int(floor(pow(hr, 0.8) * 6.0 * sp + 0.35));
    for (int k = 0; k < 6; k++) {
      if (k >= n) break;
      float hk = h11(ring * 1.37 + float(k) * 19.13);
      float rel = mod(phi - hk * 6.2831853 + uRot, 6.2831853);
      float along = (rel <= W ? 0.0 : min(rel - W, 6.2831853 - rel)) * sp;
      float b = h11(ring * 2.9 + float(k) * 7.7);
      float bright = 0.1 + 3.2 * pow(b, 7.0);
      float fade = rel <= W ? 0.3 + 0.7 * exp(-2.5 * rel / max(W, 1e-4)) : 1.0;
      float g = exp(-(perp * perp + along * along) / (w * w)) * fade;
      col += mix(vec3(0.62, 0.75, 1.0), vec3(1.0, 0.8, 0.56), h11(ring + float(k) * 3.3)) * bright * g;
    }
  }
  return col;
}

vec3 milkyWay(vec3 d) {
  vec3 q = rotAxis(d, uPole, uRot);
  vec3 n = normalize(vec3(-0.2, 0.35, 0.9));
  float band = exp(-pow(dot(q, n) / 0.2, 2.0));
  float f = fbm3(q * 5.0);
  float dust = smoothstep(0.45, 0.75, fbm3(q * 11.0 + 3.0));
  return mix(vec3(0.55, 0.6, 0.8), vec3(0.95, 0.82, 0.68), f) * band * (0.25 + 0.75 * f) * (1.0 - 0.65 * dust * band) * 0.035;
}

// angular distance from v to the arc between two unit vectors (short arcs: chord approximation)
float segDist(vec3 v, vec3 a, vec3 b, out float along) {
  vec3 ab = b - a;
  float t = clamp(dot(v - a, ab) / max(dot(ab, ab), 1e-12), 0.0, 1.0);
  along = t;
  return length(v - (a + ab * t));
}

void main() {
  vec3 v = normalize(vDir);
  vec3 c = atmosphere(v);
  float se = uSunDir.y;
  float dayK = smoothstep(-0.01, 0.3, se), twK = smoothstep(-0.22, -0.02, se);

  // ---- night sky (under the clouds) ----
  float starVis = (1.0 - smoothstep(-0.2, -0.04, se)) * smoothstep(-0.01, 0.08, v.y) * (1.0 - uWhite);
  vec3 nightSky = vec3(0.0);
  if (starVis > 0.0) nightSky = (starTrails(v) + milkyWay(v)) * starVis * (1.0 - 0.5 * exp(-max(v.y, 0.0) * 12.0) * uCity);
  // Venus: the evening star, setting right after the Sun
  { float a = length(v - uVenusDir); float w = uPx * 1.2;
    nightSky += vec3(1.0, 0.97, 0.9) * 7.0 * (exp(-a * a / (w * w)) + 0.04 * exp(-a / (w * 7.0))) * (1.0 - smoothstep(-0.15, 0.0, se) * 0.85) * smoothstep(-0.005, 0.02, uVenusDir.y) * (1.0 - uWhite); }
  c += nightSky;

  // ---- the Moon (waxing gibbous, lit from the Sun's side) ----
  {
    const float MR = 0.0046;
    float a = acos(clamp(dot(v, uMoonDir), -1.0, 1.0));
    if (a < MR * 4.0 && uMoonDir.y > -0.02) {
      vec3 ax = normalize(cross(vec3(0.0, 1.0, 0.0), uMoonDir));
      vec3 ay = cross(uMoonDir, ax);
      vec2 q = vec2(dot(v, ax), dot(v, ay)) / MR;
      float r2 = dot(q, q);
      float disk = 1.0 - smoothstep(1.0 - uPx * 1.5 / MR, 1.0 + uPx * 1.5 / MR, sqrt(r2));
      vec3 nrm = normalize(ax * q.x + ay * q.y + uMoonDir * sqrt(max(1.0 - r2, 0.0)));
      float lit = smoothstep(-0.05, 0.12, dot(nrm, uSunDir));
      float mare = 0.75 + 0.25 * smoothstep(0.35, 0.65, fbm3(vec3(q * 2.2, 4.0)));
      vec3 moonC = vec3(1.0, 0.97, 0.9) * (lit * mare * 3.2 + 0.03);
      float vis = smoothstep(-0.02, 0.03, uMoonDir.y) * (1.0 - uWhite);
      c = mix(c, c * 0.2 + moonC * mix(1.0, 0.35, dayK), disk * vis);
      c += vec3(0.8, 0.85, 1.0) * 0.05 * exp(-a / 0.03) * vis * (1.0 - dayK);
    }
  }

  // ---- the Sun, with a streak along its path (a phone time-lapse exposure) ----
  {
    const float SR = 0.0047;
    float along;
    float d = segDist(v, uSunPrev, uSunDir, along);
    float aa = uPx * 1.2;
    float core = 1.0 - smoothstep(SR - aa, SR + aa, d);
    float redden = smoothstep(0.0, 0.5, se);
    vec3 sunC = mix(vec3(1.0, 0.36, 0.08), vec3(1.0, 0.94, 0.84), redden);
    float trailFade = 0.25 + 0.75 * along;          // brightest at the Sun's current position
    float above = smoothstep(-0.01, 0.004, dot(v, vec3(0.0, 1.0, 0.0)));
    c += sunC * core * trailFade * mix(14.0, 34.0, redden) * above;
    c += sunC * (0.7 * exp(-d / 0.012) + 0.25 * exp(-d / 0.04)) * trailFade * smoothstep(-0.05, 0.05, se) * above;
  }

  // ---- cumulus: a cloud deck moving fast in the time-lapse, smeared along its motion ----
  if (v.y > 0.0) {
    float dist = uCloudH / max(v.y, 0.02);
    vec2 base = v.xz * dist * 0.0011 + uCloudOff;
    float cov = 0.0;
    for (int i = 0; i < 3; i++) {
      vec2 p = base - uCloudBlur * (float(i) / 2.0);
      float n = fbm3(vec3(p, uCloudMorph));
      cov += smoothstep(0.62 - 0.2 * uCloudCover, 0.82 - 0.2 * uCloudCover, n);
    }
    cov /= 3.0;
    float far = smoothstep(0.015, 0.12, v.y);
    cov *= mix(0.35, 1.0, far) * (1.0 - smoothstep(9000.0, 40000.0, dist));
    // light: white tops by day, gold and pink at sunset, dark grey lit orange from the city below at night
    float toSun = pow(max(dot(v, uSunDir), 0.0), 3.0);
    vec3 dayC = mix(vec3(0.66, 0.69, 0.74), vec3(1.0, 0.98, 0.95), 0.55 + 0.45 * toSun);
    float goldC = 1.0 - smoothstep(0.04, 0.4, se);
    dayC = mix(dayC, mix(vec3(0.62, 0.48, 0.5), vec3(1.0, 0.7, 0.42), 0.4 + 0.6 * toSun), goldC * 0.8);
    vec3 twC = mix(vec3(0.42, 0.3, 0.42), vec3(1.0, 0.55, 0.28), pow(max(dot(normalize(v.xz + 1e-5), normalize(uSunDir.xz + 1e-5)) * 0.5 + 0.5, 0.0), 2.5));
    vec3 nightC = vec3(0.022, 0.026, 0.045) + vec3(0.11, 0.06, 0.03) * uCity * (1.0 - far * 0.5);
    vec3 cc = mix(nightC, twC * mix(0.3, 1.0, smoothstep(-0.16, 0.0, se)), twK);
    cc = mix(cc, dayC, dayK);
    c = mix(c, cc, cov * 0.88 * (1.0 - uWhite));
  }

  if (any(isnan(c)) || any(isinf(c))) c = vec3(0.0);
  gl_FragColor = vec4(clamp(c, 0.0, 60.0), 1.0);
}
`;

export function makeSky() {
  const uniforms = {
    uTime: { value: 0 }, uPx: { value: 0.0006 },
    uSunDir: { value: new THREE.Vector3() }, uSunPrev: { value: new THREE.Vector3() },
    uMoonDir: { value: new THREE.Vector3() }, uVenusDir: { value: new THREE.Vector3() },
    uPole: { value: new THREE.Vector3(1, 0, 0) }, uRot: { value: 0 }, uTrail: { value: 0 },
    uCity: { value: 0 }, uWhite: { value: 0 },
    uCloudH: { value: 900 }, uCloudOff: { value: new THREE.Vector2() }, uCloudMorph: { value: 0 },
    uCloudBlur: { value: new THREE.Vector2() }, uCloudCover: { value: 0.5 },
  };
  const mat = new THREE.ShaderMaterial({ uniforms, vertexShader: vert, fragmentShader: frag, side: THREE.BackSide, depthWrite: false, depthTest: false });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1000, 64, 32), mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;
  return { mesh, uniforms };
}
