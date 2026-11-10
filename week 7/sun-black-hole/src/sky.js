// The sky, the Sun going out, the stars, and the black hole where the Sun was.
//   Day: a deep blue noon sky, paler toward the horizon, a few fair-weather clouds racing in the time-lapse, the Sun a
//   blinding white disk (uSunR rad). It goes out from the middle: inside uDarkR (Sun radii) its light has stopped.
//   uLight (the share of sunlight still arriving) dims the whole sky with it: the air only glows because the Sun lights it.
//   Night: stars (two layers on the sphere) and the Milky Way, the glow of the city lights low over the far shore and
//   behind you, and (uOver) the low overcast the steaming sea makes, lit orange from below.
//   The zoom (uDeep 0..1): a "deep field" of fainter and fainter stars in arcseconds around the black hole, seen through
//   its lens. Every point of the picture at angle theta from it shows the sky at beta = theta - thetaE^2 / theta (a point
//   mass, thetaE = 41"), so the stars behind it are smeared into arcs round a ring 41" in radius; inside the ring they are
//   squeezed so small they fade out: the dark "hole" in the middle.
import * as THREE from 'three';

const vert = /* glsl */ `
varying vec3 vDir;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vDir = wp.xyz - cameraPosition;
  gl_Position = projectionMatrix * viewMatrix * wp;
  gl_Position.z = gl_Position.w;   // exactly on the far plane (see makeSky)
}`;

const frag = /* glsl */ `
precision highp float;
varying vec3 vDir;
uniform vec3 uSun; uniform float uSunR; uniform float uDarkR; uniform float uLight; uniform float uPx; uniform vec2 uRes;
uniform float uStars; uniform float uCloud; uniform float uDrift; uniform float uOver; uniform float uCityGlow; uniform float uTime;
uniform float uDeep; uniform vec2 uOff; uniform mat2 uM; uniform float uThE; uniform float uDeepPx; uniform float uExpo;
float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float h31(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
float n3(vec3 p) { vec3 i = floor(p); vec3 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(h31(i), h31(i + vec3(1,0,0)), f.x), mix(h31(i + vec3(0,1,0)), h31(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(h31(i + vec3(0,0,1)), h31(i + vec3(1,0,1)), f.x), mix(h31(i + vec3(0,1,1)), h31(i + vec3(1,1,1)), f.x), f.y), f.z); }
float fbm(vec3 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * n3(p); p = p * 2.03 + 7.1; a *= 0.5; } return s; }
float n2(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }

// stars on the sphere: one per cell (some cells empty), a point about a pixel and a half wide
vec3 starLayer(vec3 v, float K, float dens, float bright, float seed) {
  vec3 p = v * K;
  vec3 c = floor(p);
  float h = h31(c + seed);
  if (h > dens) return vec3(0.0);
  vec3 pos = c + 0.25 + 0.5 * vec3(h31(c + seed + 11.0), h31(c + seed + 23.0), h31(c + seed + 37.0));
  vec3 d = (p - pos) / K;
  float r = length(d - v * dot(d, v));
  float sig = uPx * 0.75;
  float m = h31(c + seed + 51.0);
  float b = bright * (0.15 + 2.6 * pow(m, 6.0));
  vec3 tint = mix(vec3(0.75, 0.85, 1.0), vec3(1.0, 0.85, 0.65), h31(c + seed + 71.0));
  return tint * b * exp(-r * r / (2.0 * sig * sig));
}
// the Milky Way: a soft lumpy band along a great circle, darker lanes through it
float milky(vec3 v) {
  vec3 n = normalize(vec3(0.35, 0.55, -0.76));
  float d = dot(v, n);
  float band = exp(-d * d / 0.03);
  float lump = fbm(v * 6.0) * 0.8 + fbm(v * 19.0) * 0.4;
  float lane = smoothstep(0.02, 0.0, abs(d - 0.03 + 0.05 * (fbm(v * 9.0) - 0.5)));
  return band * clamp(lump - 0.35, 0.0, 1.0) * (1.0 - 0.6 * lane);
}
// the deep field: stars at every scale, in arcseconds (b) around the black hole; px = arcsec per pixel
vec3 deepStars(vec2 b, float px, float shrink) {
  vec3 acc = vec3(0.0);
  float cell = 2400.0;
  for (int k = 0; k < 11; k++) {
    float fk = float(k);
    float onScreen = cell / px;
    float a = smoothstep(10.0, 28.0, onScreen);
    if (a > 0.0) {
      vec2 q = b / cell;
      vec2 c = floor(q);
      float h = h21(c + fk * 17.31);
      if (h < 0.55) {
        vec2 pos = c + 0.1 + 0.8 * vec2(h21(c + fk * 7.7 + 3.1), h21(c + fk * 5.3 + 9.4));
        float d = length(q - pos) * cell;
        float sig = min(max(px * 0.9, 0.35), cell * 0.025);
        float m = h21(c + fk * 3.9 + 1.7);
        float br = 1.5 * pow(0.8, fk) * (0.2 + 2.2 * pow(m, 5.0));
        vec3 tint = mix(vec3(0.72, 0.84, 1.0), vec3(1.0, 0.82, 0.62), h21(c + fk * 2.3 + 5.5));
        acc += tint * br * a * exp(-d * d / (2.0 * sig * sig)) * shrink;
      }
    }
    cell *= 0.5;
  }
  // a star that happens to sit almost straight behind it: the black hole spreads it into a full ring
  vec2 s0 = b - vec2(4.0, 1.5);
  acc += vec3(1.0, 0.93, 0.82) * 2.2 * exp(-dot(s0, s0) / (2.0 * 1.8 * 1.8));
  // the faint glow of the Milky Way's unresolved stars behind
  acc += vec3(0.012, 0.013, 0.018) * (0.5 + 0.8 * n2(b / 90.0)) * shrink;
  return acc;
}

void main() {
  vec3 v = normalize(vDir);
  float h = v.y;
  float cs = dot(v, uSun);
  float ang = acos(clamp(cs, -1.0, 1.0));
  float hh = clamp(h, 0.0, 1.0);
  // ---------- the day sky (scaled by the light still arriving) ----------
  vec3 top = vec3(0.03, 0.13, 0.52);
  vec3 low = vec3(0.3, 0.5, 0.8);
  vec3 c = mix(low, top, pow(smoothstep(-0.02, 0.55, hh), 0.55));
  c += vec3(1.0, 0.95, 0.85) * (pow(max(cs, 0.0), 60.0) * 0.22 + pow(max(cs, 0.0), 900.0) * 0.9);
  // fair-weather clouds, racing in the time-lapse
  if (h > 0.0 && uCloud > 0.0) {
    float dist = 1500.0 / max(h, 0.035);
    vec2 p = v.xz * dist + vec2(uDrift, uDrift * 0.35);
    float n = fbm(vec3(p / 1300.0, 2.0));
    float cov = smoothstep(0.58, 0.72, n) * (1.0 - smoothstep(14000.0, 36000.0, dist)) * uCloud;
    vec3 cc = mix(vec3(0.92, 0.94, 0.98), vec3(1.25, 1.18, 1.05), pow(max(cs, 0.0), 5.0));
    cc *= 0.82 + 0.22 * fbm(vec3(p / 380.0, 5.0));
    c = mix(c, cc, cov * 0.9);
  }
  c *= uLight;
  // ---------- the night ----------
  vec3 night = vec3(0.004, 0.006, 0.014) + vec3(0.012, 0.016, 0.03) * (1.0 - hh);
  float st = uStars * (1.0 - uOver);
  if (st > 0.0 && uDeep < 0.999) {
    vec3 s = starLayer(v, 60.0, 0.25, 1.1, 0.0) + starLayer(v, 120.0, 0.2, 0.55, 5.0) + starLayer(v, 240.0, 0.08, 0.3, 9.0);
    night += s * st * (1.0 - uDeep) * smoothstep(-0.02, 0.06, h);
    night += vec3(0.07, 0.075, 0.09) * milky(v) * st * (1.0 - uDeep);
  }
  // city glow: low over the far shore (to the right, out to sea) and above the hotels behind you
  float far = exp(-pow((atan(v.x, -v.z) - 0.42) / 0.38, 2.0)) * exp(-max(h, 0.0) / 0.05);
  float back = smoothstep(0.1, -0.6, v.z) * exp(-max(h, 0.0) / 0.12);
  night += vec3(0.5, 0.3, 0.14) * (far * 0.14 + back * 0.22) * uCityGlow;
  // the overcast from the steaming sea, lit from below by the city
  if (uOver > 0.0 && h > -0.02) {
    float dist = 700.0 / max(h, 0.03);
    vec2 p = v.xz * dist + vec2(uTime * 6.0, uTime * 2.0);
    float n = fbm(vec3(p / 600.0, uTime * 0.03));
    vec3 oc = vec3(0.05, 0.05, 0.056) * (0.7 + 0.6 * n) + vec3(0.26, 0.19, 0.13) * (far * 0.6 + back * 0.8 + 0.08) * (0.6 + 0.6 * n);
    night = mix(night, oc, uOver * (0.85 + 0.15 * smoothstep(0.0, 0.2, h)));
  }
  // ---------- the deep zoom round the black hole ----------
  if (uDeep > 0.0) {
    vec2 ndc = gl_FragCoord.xy / uRes * 2.0 - 1.0;
    vec2 th = (uOff + uM * ndc) * 206264.8;           // arcseconds from the black hole
    float r = length(th);
    float E2 = uThE * uThE;
    vec2 b = th - th * E2 / max(r * r, 1e-6);
    // how much each image is squeezed (the point lens' two stretches); images squeezed below a pixel fade
    float tang = r / max(length(b), 1e-4);
    float rad = 1.0 / (1.0 + E2 / max(r * r, 1e-6));
    float sq = min(tang, rad);
    float shrink = clamp(sq * 1.3, 0.0, 1.0);
    vec3 ds = deepStars(b, uDeepPx / max(sq, 1e-3), shrink);
    // the black hole itself: 0.02" across, far below a pixel even here (drawn as a dot of a pixel or two)
    ds *= smoothstep(uDeepPx * 0.6, uDeepPx * 1.6, r);
    night = mix(night, vec3(0.003, 0.004, 0.009) + ds, uDeep);
  }
  // ---------- the Sun ----------
  float R = uSunR;
  float rq = ang / R;
  float edge = smoothstep(1.0 + uPx / R * 0.8, 1.0 - uPx / R * 0.8, rq);
  float mu = sqrt(max(0.0, 1.0 - rq * rq));
  vec3 sunC = vec3(1.0, 0.94, 0.84) * (0.45 + 0.55 * mu) * 14.0;
  // the dark spreads out from its middle (the last light from the edge still on the way)
  float lit = smoothstep(uDarkR - uPx / R * 0.7, uDarkR + uPx / R * 0.7, rq);
  // the glare round it (goes with the light)
  float glare = exp(-max(ang - R, 0.0) / 0.01) * 0.6 + exp(-max(ang - R, 0.0) / 0.0025) * 1.2;
  vec3 col = c + night;
  col += vec3(1.0, 0.96, 0.9) * glare * uLight;
  col = mix(col, sunC, edge * lit);
  gl_FragColor = vec4(clamp(col, 0.0, 60.0), 1.0);
}`;

export function makeSky() {
  const uniforms = {
    uSun: { value: new THREE.Vector3(0, 0.5, -0.8) }, uSunR: { value: 0.00465 }, uDarkR: { value: 0 }, uLight: { value: 1 },
    uPx: { value: 0.0006 }, uRes: { value: new THREE.Vector2(1080, 1920) },
    uStars: { value: 0 }, uCloud: { value: 1 }, uDrift: { value: 0 }, uOver: { value: 0 }, uCityGlow: { value: 0 }, uTime: { value: 0 },
    uDeep: { value: 0 }, uOff: { value: new THREE.Vector2() }, uM: { value: new THREE.Matrix2() }, uThE: { value: 41.0 }, uDeepPx: { value: 1 },
    uExpo: { value: 1 },
  };
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1000, 64, 32), new THREE.ShaderMaterial({ uniforms, vertexShader: vert, fragmentShader: frag, side: THREE.BackSide, depthWrite: false, depthTest: true }));
  mesh.frustumCulled = false;
  // Drawn after every other opaque object, depth-tested at the far plane: the sky shader then only runs where sky
  // is actually visible, instead of on the whole frame before the world is drawn over it. Transparent objects
  // still come after it, so the picture is the same. (Needs every other opaque object to write and test depth.)
  mesh.renderOrder = 1000;
  return { mesh, uniforms };
}
