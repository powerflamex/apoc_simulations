// The sky around you: the stars of the galactic centre and the black hole's accretion disk, with every pixel's
// light ray traced back through the bent space around the hole (Schwarzschild, r_s = 1).
// You are a free-falling observer at distance uD: a pixel's direction is first un-aberrated from your frame
// (you rush toward the hole at uBeta) into the frame of someone holding still there, then turned into the photon's
// angular momentum h = D sin(a) / sqrt(1 - 1/D) and integrated backwards (acc = -1.5 h^2 x / r^5) until it falls
// through the horizon (black), escapes (the stars), crossing the disk plane on the way (its light adds up).
// Inside the edge (uShrink > 1) the view from just outside is squeezed: the universe shrinks into a circle
// above you, and at the very end (uRing) it is smeared into a thin ring around you.
import * as THREE from 'three';

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
uniform vec3 uF;          // world direction toward the hole
uniform float uD;         // your distance from the centre (r_s)
uniform float uBeta;      // your speed toward it (fraction of c) for the aberration
uniform float uShrink;    // inside: how much the circle of sky above you has shrunk
uniform float uRing;      // the very end: the sky smeared into a ring
uniform float uDisk;      // disk brightness
uniform float uTime;      // disk spin phase
uniform float uPx;        // radians per pixel
uniform float uStar;      // star brightness
uniform float uSkyGain;   // the light from outside piling up (inside the edge)
uniform vec4 uYou;        // the shot from far away: your direction (xyz) and how bright your dot is (w)
uniform vec3 uYouCol;
uniform vec3 uNd;         // disk normal (hole frame)

float hash13(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
vec3 hash33(vec3 p) {
  p = fract(p * vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yxz + 33.33);
  return fract((p.xxy + p.yxx) * p.zyx);
}
float noise3(vec3 p) {
  vec3 i = floor(p); vec3 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash13(i), hash13(i + vec3(1,0,0)), f.x), mix(hash13(i + vec3(0,1,0)), hash13(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(hash13(i + vec3(0,0,1)), hash13(i + vec3(1,0,1)), f.x), mix(hash13(i + vec3(0,1,1)), hash13(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float fbm(vec3 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * noise3(p); p = p * 2.03 + 7.1; a *= 0.5; } return s; }

vec3 starLayer(vec3 d, float scale, float density, float seed, float bright) {
  vec3 p = d * scale;
  vec3 c = floor(p);
  vec3 h = hash33(c + seed);
  if (h.x > density) return vec3(0.0);
  vec3 sp = c + 0.3 + 0.4 * hash33(c + seed + 19.7);
  vec3 sd = normalize(sp);
  float ang = length(d - sd);
  float w = uPx * 0.9;
  float b = exp(-ang * ang / (w * w)) * pow(h.y, 4.0) * bright;
  vec3 tint = mix(vec3(0.7, 0.82, 1.0), vec3(1.0, 0.78, 0.5), h.z);
  return tint * b;
}

// the galactic centre: a crowded, warm star field, the bulge glow and the dusty plane of the Milky Way
vec3 space(vec3 d) {
  vec3 g = normalize(vec3(0.28, 0.93, 0.24));          // the galactic plane's normal
  float lat = dot(d, g);
  float band = exp(-pow(lat / 0.24, 2.0));
  float f = fbm(d * 4.0);
  float dust = smoothstep(0.42, 0.72, fbm(d * 9.0 + 3.0)) * exp(-pow(lat / 0.09, 2.0));
  vec3 c = mix(vec3(0.45, 0.42, 0.55), vec3(1.0, 0.72, 0.45), f) * band * (0.35 + 0.65 * f) * (1.0 - 0.8 * dust);
  c *= 0.16;
  c += vec3(1.0, 0.66, 0.38) * 0.05 * exp(-pow(lat / 0.5, 2.0)) * (0.6 + 0.4 * f);
  // nebula wisps
  float neb = smoothstep(0.55, 0.85, fbm(d * 2.2 + 11.0));
  c += vec3(0.55, 0.18, 0.32) * neb * 0.05 + vec3(0.15, 0.3, 0.55) * smoothstep(0.6, 0.9, fbm(d * 3.1 + 5.0)) * 0.04;
  c += starLayer(d, 60.0, 0.6, 0.0, 7.0) * (1.0 + 1.5 * band);
  c += starLayer(d, 110.0, 0.55, 41.0, 3.5) * (1.0 + 2.0 * band);
  c += starLayer(d, 190.0, 0.5, 87.0, 1.8) * (1.0 + 3.0 * band);
  return c * uStar;
}

vec3 heat(float t) {   // blackbody-ish: deep red -> orange -> yellow-white -> blue-white
  vec3 c = vec3(0.6, 0.05, 0.005);
  c = mix(c, vec3(1.0, 0.24, 0.02), smoothstep(0.0, 0.4, t));
  c = mix(c, vec3(1.0, 0.5, 0.1), smoothstep(0.35, 0.8, t));
  c = mix(c, vec3(1.0, 0.82, 0.55), smoothstep(0.8, 1.25, t));
  c = mix(c, vec3(0.8, 0.88, 1.0), smoothstep(1.3, 2.0, t));
  return c;
}

// the accretion disk where a ray crosses its plane (hole frame)
vec4 disk(vec3 p, vec3 vel, vec3 e1, vec3 e2) {
  float r = length(p);
  float inner = 3.0, outer = 24.0;
  if (r < 1.55 || r > outer) return vec4(0.0);
  float x = dot(p, e1), z = dot(p, e2);
  float a = atan(z, x);
  float ang = a - uTime * pow(r / 3.0, -1.5);           // inner gas laps the outer gas
  vec3 np = vec3(cos(ang) * r, sin(ang) * r, r * 0.7);
  float n = fbm(np * 0.55);
  float lanes = fbm(vec3(r * 2.6, cos(ang) * 1.5, sin(ang) * 1.5));
  float flux = pow(inner / r, 2.2) * (1.0 - 0.75 * sqrt(inner / max(r, inner)));
  flux *= (1.0 - smoothstep(outer * 0.5, outer, r));
  // inside the last stable orbit the gas plunges in: thinner, dimmer streams
  if (r < inner) flux = 0.11 * pow((r - 1.55) / (inner - 1.55), 1.5) * (0.4 + 0.6 * smoothstep(0.45, 0.7, fbm(vec3(r * 3.0, ang * 2.0, 1.0))));
  flux *= 0.35 + 1.25 * n * (0.55 + 0.9 * lanes);
  // Doppler beaming and the pull of gravity on the light
  vec3 tang = normalize(cross(uNd, p));
  float bo = min(sqrt(0.5 / (r - 1.0)), 0.6);
  float cpsi = dot(tang, -normalize(vel));
  float g = sqrt(max(1.0 - 1.5 / r, 0.02)) / (1.0 - bo * cpsi);
  float I = flux * pow(g, 3.5);
  vec3 col = heat(0.2 + 3.2 * flux * g + 0.35 * (g - 1.0));
  float alpha = clamp(flux * 4.0 * (0.5 + 0.5 * n), 0.0, 0.96);
  return vec4(col * I * 9.0 * uDisk, alpha * min(uDisk * 2.0, 1.0));
}

void main() {
  vec3 v = normalize(vDir);
  // hole frame: z toward the hole
  vec3 F = uF;
  vec3 R = normalize(cross(F, vec3(0.0, 1.0, 0.0)));
  vec3 U = cross(R, F);
  vec3 d = vec3(dot(v, R), dot(v, U), dot(v, F));
  vec3 col = vec3(0.0);

  // ---- inside: squeeze the view into a circle above you (then a ring around you) ----
  float thB = acos(clamp(-d.z, -1.0, 1.0));            // angle from straight up (away from the centre)
  vec2 az = d.xy / max(length(d.xy), 1e-6);
  float dark = 0.0;
  float gain = 1.0;
  if (uShrink > 1.0001 || uRing > 0.0) {
    float th = thB * uShrink;
    // the end: the circle closes to a point while its light is smeared into a ring 90 degrees from up
    float hw = mix(0.5, 0.035, uRing);
    float bd = abs(thB - 1.5708);
    if (uRing > 0.0 && bd < hw) {
      th = bd / hw * 0.8;
      float az2 = atan(az.y, az.x) * 2.0 + uTime * 3.0;
      az = vec2(cos(az2), sin(az2));
      gain = uRing * 2.5 * (1.0 - bd / hw);
    }
    if (th > 3.1) { dark = 1.0; th = 3.1; }
    d = vec3(az * sin(th), -cos(th));
  }

  // ---- un-aberrate: your direction -> the direction for someone holding still here ----
  float cf = d.z;
  float cs = (cf - uBeta) / (1.0 - uBeta * cf);
  float ss = sqrt(max(1.0 - cs * cs, 0.0));
  vec2 t2 = d.xy / max(length(d.xy), 1e-6);
  vec3 ds = vec3(t2 * ss, cs);

  // ---- trace the ray back ----
  float D = uD;
  float ca = -ds.z;                                     // cos of the angle from straight out
  float sa = ss;
  float h = D * sa / sqrt(max(1.0 - 1.0 / D, 1e-4));
  vec3 pos = vec3(0.0, 0.0, -D);
  vec3 vel = vec3(t2 * (h / D), -ca);
  float h2 = h * h;
  vec3 nD = uNd;
  vec3 e1 = normalize(cross(nD, vec3(0.0, 0.0, 1.0)));
  vec3 e2 = cross(e1, nD);
  float alpha = 0.0;
  bool captured = false;
  for (int i = 0; i < 320; i++) {
    float r2 = dot(pos, pos);
    float r = sqrt(r2);
    float dt = clamp(0.05 * r * (0.4 + 0.6 * smoothstep(1.0, 4.0, r)), 0.004, 3.0);
    vec3 acc = -1.5 * h2 * pos / (r2 * r2 * r);
    vec3 prev = pos;
    vel += acc * dt;
    pos += vel * dt;
    if (uDisk > 0.001) {
      float a0 = dot(prev, nD), a1 = dot(pos, nD);
      if (a0 * a1 < 0.0) {
        vec3 hit = mix(prev, pos, a0 / (a0 - a1));
        vec4 e = disk(hit, vel, e1, e2);
        col += (1.0 - alpha) * e.rgb;
        alpha += (1.0 - alpha) * e.a;
      }
    }
    if (r < 1.0) { captured = true; break; }
    if (r > 90.0 && dot(pos, vel) > 0.0) break;
    if (alpha > 0.995) break;
  }
  if (captured) alpha = 1.0;
  vec3 outDir = normalize(vel);
  vec3 bg = alpha < 0.999 ? space(outDir) : vec3(0.0);
  col = col + (1.0 - alpha) * bg;
  col *= uSkyGain * gain * (1.0 - dark);

  // your dot, seen from far away
  if (uYou.w > 0.0) {
    float an = acos(clamp(dot(v, uYou.xyz), -1.0, 1.0));
    float w = uPx * 3.0;
    col += uYouCol * uYou.w * (exp(-an * an / (w * w)) * 9.0 + exp(-an / (w * 3.0)) * 0.6);
  }
  if (any(isnan(col)) || any(isinf(col))) col = vec3(0.0);
  gl_FragColor = vec4(clamp(col, 0.0, 80.0), 1.0);
}
`;

export function makeSky() {
  const lat = 13 * Math.PI / 180, roll = -11 * Math.PI / 180;
  const uniforms = {
    uF: { value: new THREE.Vector3(0, -0.3, -1).normalize() },
    uD: { value: 30 }, uBeta: { value: 0 }, uShrink: { value: 1 }, uRing: { value: 0 },
    uDisk: { value: 1 }, uTime: { value: 0 }, uPx: { value: 0.0007 }, uStar: { value: 1 }, uSkyGain: { value: 1 },
    uYou: { value: new THREE.Vector4(0, 0, -1, 0) }, uYouCol: { value: new THREE.Color(1, 1, 1) },
    uNd: { value: new THREE.Vector3(Math.sin(roll) * Math.cos(lat), Math.cos(roll) * Math.cos(lat), -Math.sin(lat)) },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms, vertexShader: vert, fragmentShader: frag,
    side: THREE.BackSide, depthWrite: false, depthTest: false,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1000, 64, 32), mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;
  return { mesh, uniforms };
}
