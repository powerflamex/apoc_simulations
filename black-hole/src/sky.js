// Sky dome: twilight atmosphere + stars + Milky Way + Moon, all gravitationally lensed by a
// Schwarzschild black hole (photon paths integrated per pixel), plus an accretion disk.
import * as THREE from 'three';

export const SKY_COMMON = /* glsl */ `
uniform float uNight;
uniform vec3 uSunDir;
uniform vec3 uBhDir;
uniform float uDisk;
vec3 atmosphere(vec3 v) {
  float e = v.y;
  float h = clamp(e, 0.0, 1.0);
  // ahead of us (away from the set sun): pink belt over the blue earth-shadow
  vec3 zen = mix(vec3(0.085, 0.16, 0.34), vec3(0.004, 0.007, 0.018), uNight);
  vec3 mid = mix(vec3(0.30, 0.30, 0.46), vec3(0.010, 0.013, 0.030), uNight);
  vec3 belt = mix(vec3(0.78, 0.50, 0.52), vec3(0.030, 0.026, 0.040), uNight);
  vec3 shadowBand = mix(vec3(0.24, 0.27, 0.42), vec3(0.016, 0.02, 0.04), uNight);
  vec3 c = mix(mid, zen, smoothstep(0.08, 0.75, h));
  c = mix(belt, c, smoothstep(0.035, 0.16, h));
  c = mix(shadowBand, c, smoothstep(0.0, 0.035, h));
  // afterglow behind us
  float s = max(dot(v, uSunDir), 0.0);
  c += vec3(1.0, 0.45, 0.18) * pow(s, 6.0) * (1.0 - uNight) * 0.8 * (1.0 - smoothstep(0.0, 0.5, h));
  // city light dome near the horizon
  c += vec3(0.30, 0.16, 0.07) * 0.06 * exp(-max(e, 0.0) * 18.0) * uNight;
  // the accretion disk lights up the air around it
  float a = acos(clamp(dot(v, uBhDir), -1.0, 1.0));
  c += vec3(1.0, 0.56, 0.26) * uDisk * (0.006 + 0.07 * exp(-a * 4.0) + 0.22 * exp(-a * 12.0));
  if (e < 0.0) c = mix(shadowBand, shadowBand * 0.5, smoothstep(0.0, -0.1, e));
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
uniform float uStarVis;
uniform float uBhD;
uniform vec3 uMoonDir;
uniform vec3 uMoonTail;
uniform float uMoonStretch;
uniform float uMoonFade;
uniform float uPx;
${SKY_COMMON}

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
  float w = uPx * 0.85;
  float b = exp(-ang * ang / (w * w)) * pow(h.y, 5.0) * bright;
  vec3 tint = mix(vec3(0.75, 0.85, 1.0), vec3(1.0, 0.85, 0.65), h.z);
  return tint * b;
}

vec3 milkyWay(vec3 d) {
  vec3 n = normalize(vec3(0.42, 0.62, 0.66));
  float band = exp(-pow(dot(d, n) / 0.2, 2.0));
  float f = fbm(d * 5.0);
  float dust = smoothstep(0.45, 0.75, fbm(d * 11.0 + 3.0));
  vec3 col = mix(vec3(0.55, 0.6, 0.8), vec3(0.95, 0.8, 0.65), f) * band * (0.25 + 0.75 * f) * (1.0 - 0.7 * dust * band);
  return col * 0.11;
}

vec3 moon(vec3 d) {
  if (uMoonFade <= 0.0) return vec3(0.0);
  vec3 m = uMoonDir;
  vec3 o = d - m * dot(d, m);
  if (dot(d, m) < 0.0) return vec3(0.0);
  vec3 tl = uMoonTail - m * dot(uMoonTail, m);
  if (dot(tl, tl) < 1e-10) tl = cross(m, vec3(0.0, 1.0, 0.0));
  vec3 tx = normalize(tl);
  vec3 ty = cross(m, tx);
  float x = dot(o, tx), y = dot(o, ty);
  float R = 0.016;
  float st = uMoonStretch;
  // tidal stream: long in the direction of the hole, thin across
  float sx = R * (1.0 + st * st * 16.0);
  float sy = R * (1.0 - 0.55 * st);
  float xs = x - sx * 0.35 * st; // stretch forward, toward the hole
  float e = (xs * xs) / (sx * sx) + (y * y) / (sy * sy);
  float edge = uPx * 1.5 / sy;
  float body = 1.0 - smoothstep(1.0 - edge, 1.0 + edge, e);
  // breakup into fragments as it stretches
  float frag = smoothstep(0.35, 0.65, noise3(vec3(xs / sx * 6.0, y / sy * 3.0, 4.2)) + 0.5 - st * 0.6);
  body *= mix(1.0, frag, smoothstep(0.2, 0.8, st));
  // full-moon shading: limb darkening + maria
  vec2 q = vec2(xs / sx, y / sy);
  float mu = sqrt(max(1.0 - dot(q, q), 0.0));
  float maria = fbm(vec3(q * 3.2, 1.7));
  vec3 c = vec3(1.0, 0.97, 0.9) * (0.55 + 0.45 * mu) * (0.78 + 0.32 * smoothstep(0.35, 0.7, maria));
  c = mix(c, vec3(1.0, 0.75, 0.5) * 1.4, st * 0.7); // heats up as it's shredded
  float glow = exp(-sqrt(max(e, 0.0)) * 3.2) * 0.12;
  return (c * body * 2.4 + vec3(0.9, 0.85, 0.8) * glow) * uMoonFade;
}

vec3 space(vec3 d) {
  vec3 c = milkyWay(d);
  c += starLayer(d, 70.0, 0.55, 0.0, 6.0);
  c += starLayer(d, 115.0, 0.45, 41.0, 3.2);
  c += starLayer(d, 180.0, 0.40, 87.0, 1.6);
  return c * uStarVis + moon(d);
}

// Accretion disk emission at disk-plane point p (BH frame, r_s = 1).
vec4 disk(vec3 p, vec3 vel, vec3 nD, vec3 e1, vec3 e2) {
  float x = dot(p, e1), z = dot(p, e2);
  float r = length(vec2(x, z));
  float inner = 3.0, outer = 15.0;
  if (r < inner * 0.9 || r > outer) return vec4(0.0);
  float a = atan(z, x);
  float rot = uTime * 1.6 * pow(r / 3.0, -1.5);
  float ang = a - rot;
  vec3 np = vec3(cos(ang) * r * 0.9, sin(ang) * r * 0.9, r * 1.4);
  float n = fbm(np * 0.9);
  float streak = fbm(vec3(r * 3.2, cos(ang) * 1.2, sin(ang) * 1.2));
  float I = pow(inner / r, 2.0) * smoothstep(inner * 0.92, inner * 1.15, r) * (1.0 - smoothstep(outer * 0.55, outer, r));
  I *= 0.45 + 1.1 * n * (0.6 + 0.8 * streak);
  // doppler beaming: the side spinning toward us is brighter + bluer
  vec3 tang = normalize(cross(nD, p));
  float dop = dot(tang, -normalize(vel));
  float beam = pow(1.0 + 0.55 * dop, 3.0);
  float temp = clamp(I * beam * 1.2, 0.0, 2.0);
  vec3 col = mix(vec3(0.9, 0.25, 0.06), vec3(1.0, 0.62, 0.3), smoothstep(0.1, 0.6, temp));
  col = mix(col, vec3(1.0, 0.95, 0.88), smoothstep(0.7, 1.6, temp));
  float alpha = clamp(I * 2.4, 0.0, 0.97);
  return vec4(col * I * beam * 5.0 * uDisk, alpha * min(uDisk * 2.0, 1.0));
}

void main() {
  vec3 v = normalize(vDir);
  vec3 atm = atmosphere(v);

  // black hole frame
  vec3 F = uBhDir;
  vec3 R = normalize(cross(F, vec3(0.0, 1.0, 0.0)));
  vec3 U = cross(R, F);
  vec3 d = vec3(dot(v, R), dot(v, U), dot(v, F));
  float D = uBhD;
  float sinT = length(d.xy);
  float cosT = d.z;
  float b = D * sinT;

  vec3 col = vec3(0.0);
  float alpha = 0.0;
  vec3 outDir;

  bool strong = cosT > 0.0 && b < 70.0;
  if (!strong) {
    // weak-field deflection for a ray from distance D
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
      // pre-bend for the far part of the path
      float pre = 1.0 / max(b, 1e-3);
      dir = normalize(dir - vec3(normalize(d.xy) * pre, 0.0) * 0.5);
    }
    // disk orientation: almost edge-on, tipped toward us
    // (the plane of the torn-up Moon's path: the debris stream runs from upper left down to the hole, so the disk keeps that tilt)
    // the disk lies in the plane of the torn-up Moon's path, so it keeps the stream's tilt
    vec3 nD = normalize(vec3(0.5, 0.86, -0.2));
    vec3 e1 = normalize(cross(nD, vec3(0.0, 0.0, 1.0)));
    vec3 e2 = cross(e1, nD);
    vec3 c3 = cross(pos, dir);
    float h2 = dot(c3, c3);
    vec3 vel = dir;
    bool captured = false;
    for (int i = 0; i < 300; i++) {
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
          vec4 e = disk(hit, vel, nD, e1, e2);
          col += (1.0 - alpha) * e.rgb;
          alpha += (1.0 - alpha) * e.a;
        }
      }
      if (r < 1.0) { captured = true; break; }
      if (r > 75.0 && dot(pos, vel) > 0.0) break;
    }
    if (captured) alpha = 1.0;
    outDir = normalize(vel);
  }
  vec3 w = normalize(R * outDir.x + U * outDir.y + F * outDir.z);
  vec3 bg = space(w);
  vec3 sp = col + (1.0 - alpha) * bg;

  // the atmosphere sits in front of everything; it thins out at night
  float trans = smoothstep(-0.01, 0.12, v.y) * mix(0.35, 1.0, uNight);
  // the hole's shadow and the disk punch through the glow
  vec3 c = atm * (1.0 - alpha * 0.85 * smoothstep(-0.01, 0.05, v.y)) + sp * trans;
  if (any(isnan(c)) || any(isinf(c))) c = atm;
  gl_FragColor = vec4(clamp(c, 0.0, 60.0), 1.0);
}
`;

export function makeSky() {
  const uniforms = {
    uTime: { value: 0 },
    uNight: { value: 0 },
    uStarVis: { value: 0 },
    uSunDir: { value: new THREE.Vector3(0.15, -0.05, 1).normalize() },
    uBhDir: { value: new THREE.Vector3(0, 0.2, -1).normalize() },
    uBhD: { value: 5000 },
    uDisk: { value: 0 },
    uMoonDir: { value: new THREE.Vector3() },
    uMoonTail: { value: new THREE.Vector3() },
    uMoonStretch: { value: 0 },
    uMoonFade: { value: 1 },
    uPx: { value: 0.0006 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms, vertexShader: vert, fragmentShader: frag,
    side: THREE.BackSide, depthWrite: false, depthTest: true,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1000, 64, 32), mat);
  mesh.frustumCulled = false;
  // Drawn after every other opaque object, depth-tested at the far plane: the sky shader (the heaviest in the
  // scene) then only runs where sky is actually visible, not on the whole frame before the world is drawn
  // over it. Transparent objects still come after it, so the picture is the same.
  mesh.renderOrder = 10;
  return { mesh, uniforms };
}
