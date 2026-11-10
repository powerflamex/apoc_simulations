// The sky, and the exploding Sun in it.
//   Before the light arrives: an early-morning tropical sky (deep blue overhead, pale gold low toward the Sun), a few
//   fair-weather clouds, the Sun a small white-gold disk.
//   After: a fireball uAng (rad) in radius around uSun: white-hot (10,000 K, a touch blue) with boiling convection
//   cells that grow with it, filaments streaming out from its centre and a ragged, brighter rim (the shock); a huge
//   glare around it; the whole sky bleached white-blue, then yellowed by smoke and whitened by steam (uHaze).
//   Mercury and Venus: blazing points in the glare until the fireball's edge reaches them.
//   uBlast (the last seconds): the fireball's front rushes at you: its pattern zooms, the whole sky burns.
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
uniform vec3 uSun; uniform float uAng; uniform float uLit; uniform float uPx; uniform float uTime; uniform float uT;
uniform float uWhite; uniform float uHaze; uniform float uSmoke; uniform float uGlare; uniform float uBlast; uniform float uDisk;
uniform vec3 uMerc; uniform vec3 uVen; uniform float uMercOn; uniform float uVenOn; uniform float uPlanetI;
uniform float uCloud; uniform float uDrift; uniform float uDark;
float hash13(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
float noise3(vec3 p) { vec3 i = floor(p); vec3 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash13(i), hash13(i + vec3(1,0,0)), f.x), mix(hash13(i + vec3(0,1,0)), hash13(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(hash13(i + vec3(0,0,1)), hash13(i + vec3(1,0,1)), f.x), mix(hash13(i + vec3(0,1,1)), hash13(i + vec3(1,1,1)), f.x), f.y), f.z); }
float fbm3(vec3 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * noise3(p); p = p * 2.03 + 7.1; a *= 0.5; } return s; }
float fbm4(vec3 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++) { s += a * noise3(p); p = p * 2.11 + 3.3; a *= 0.5; } return s; }

void main() {
  vec3 v = normalize(vDir);
  float h = v.y;
  float cs = dot(v, uSun);
  float ang = acos(clamp(cs, -1.0, 1.0));
  // ---------- the morning sky ----------
  float hh = clamp(h, 0.0, 1.0);
  vec3 sh = normalize(vec3(uSun.x, 0.0, uSun.z));
  float az = max(dot(normalize(vec3(v.x, 0.0, v.z) + 1e-5), sh), 0.0);
  vec3 top = vec3(0.04, 0.16, 0.52);
  vec3 low = mix(vec3(0.5, 0.66, 0.86), vec3(1.0, 0.82, 0.6), pow(az, 10.0) * (1.0 - smoothstep(0.0, 0.25, hh)));
  vec3 c = mix(low, top, pow(smoothstep(0.0, 0.6, hh), 0.6));
  c += vec3(1.0, 0.82, 0.58) * (pow(max(cs, 0.0), 90.0) * 0.3 + pow(max(cs, 0.0), 900.0) * 2.2);
  // after the flash: everything washes out toward white-blue (a far brighter, hotter light), the glare spreads
  vec3 bleach = mix(vec3(0.85, 0.9, 1.0), vec3(0.35, 0.55, 0.95), smoothstep(0.05, 0.6, hh)) * (1.0 + 0.6 * pow(max(cs, 0.0), 3.0));
  c = mix(c, bleach, uWhite);
  c *= 1.0 + 0.15 * uLit;
  // fair-weather clouds (they burn off as the light grows)
  if (h > 0.0 && uCloud > 0.0) {
    float dist = 1800.0 / max(h, 0.04);
    vec2 p = v.xz * dist + vec2(uDrift, uDrift * 0.4);
    float n = fbm3(vec3(p / 1500.0, 2.0));
    float cov = smoothstep(0.6, 0.74, n) * 0.85 * (1.0 - smoothstep(15000.0, 40000.0, dist)) * uCloud;
    vec3 cc = mix(vec3(0.95, 0.9, 0.86), vec3(1.25, 1.05, 0.85), pow(max(cs, 0.0), 6.0));
    cc *= 0.8 + 0.25 * fbm3(vec3(p / 400.0, 5.0));
    cc = mix(cc, vec3(1.3), uWhite * 0.7);
    c = mix(c, cc, cov * 0.85);
  }
  // smoke from the burning city and hills (brown-orange, low) and steam (white, everywhere)
  float lowK = 1.0 - smoothstep(-0.02, 0.4, h);
  c = mix(c, vec3(0.62, 0.42, 0.26) * (0.8 + 0.6 * pow(max(cs, 0.0), 4.0)), uSmoke * (0.25 + 0.55 * lowK));
  c = mix(c, vec3(1.05, 1.0, 0.94) * (0.9 + 0.4 * pow(max(cs, 0.0), 3.0)), uHaze * (0.35 + 0.45 * lowK));
  // late on: the sky away from the Sun goes dark with smoke (so the fireball reads)
  c *= 1.0 - uDark * (0.7 - 0.5 * pow(max(cs, 0.0), 4.0));
  // the glare around the Sun (grows with its brightness)
  float R = uAng;
  float g = exp(-max(ang - R, 0.0) / (0.012 + 0.05 * uGlare)) * uGlare * (1.0 - 0.6 * smoothstep(0.05, 0.4, R));
  c += vec3(1.0, 0.95, 0.88) * g * 1.6 * uLit;
  c += vec3(1.0, 0.98, 0.95) * exp(-max(ang - R, 0.0) / 0.006) * 2.0 * uLit;
  // ---------- the planets ----------
  float pd = acos(clamp(dot(v, uMerc), -1.0, 1.0));
  c += vec3(1.0, 0.95, 0.88) * (exp(-pd * pd / (uPx * uPx * 12.0)) * 14.0 + exp(-pd / (uPx * 14.0)) * 1.2) * uMercOn * uPlanetI;
  float vd = acos(clamp(dot(v, uVen), -1.0, 1.0));
  c += vec3(1.0, 0.97, 0.9) * (exp(-vd * vd / (uPx * uPx * 20.0)) * 18.0 + exp(-vd / (uPx * 18.0)) * 1.6) * uVenOn * uPlanetI;
  // ---------- the Sun / the fireball ----------
  // coordinates on the fireball: an azimuthal map around its centre, scaled by its radius (the pattern grows with it)
  vec3 e1 = normalize(cross(uSun, vec3(0.0, 1.0, 0.0)));
  vec3 e2 = cross(e1, uSun);
  vec3 vp = v - uSun * cs;
  float lp = length(vp);
  vec2 dir2 = lp > 1e-6 ? vec2(dot(vp, e1), dot(vp, e2)) / lp : vec2(1.0, 0.0);
  vec2 q = dir2 * ang / max(R, 1e-5);             // |q| = 1 at the rim
  float rq = length(q);
  float th = atan(dir2.y, dir2.x);
  float zoom = 1.0 + uBlast * uBlast * 6.0;
  float tt = uT;
  // the ragged rim: plumes pushing out
  float rim = 1.0 + (0.035 + 0.04 * uDisk) * (fbm4(vec3(cos(th) * 4.0, sin(th) * 4.0, tt * 0.25)) - 0.5) * 2.0 * uDisk;
  float edgeW = max(uPx * 1.3 / max(R, 1e-5), 0.004);
  float inside = 1.0 - smoothstep(rim - edgeW, rim + edgeW, rq);
  vec3 sunC;
  if (uDisk < 0.01) {
    // the normal Sun: a white-gold disk, slightly darker at the edge
    sunC = vec3(1.0, 0.92, 0.78) * (1.0 - 0.35 * rq * rq) * 9.0;
  } else {
    vec2 qq = q / zoom;
    // boiling convection cells (bright) with darker, cooler lanes between them; filaments streaming out
    float cells = fbm3(vec3(qq * 4.5, tt * 0.18));
    float fine = fbm4(vec3(qq * 22.0 + 3.0, tt * 0.3));
    float fil = fbm4(vec3(th * 3.0, rq * 2.2 / zoom - tt * 0.12, 1.7));
    float pat = clamp((cells - 0.32) * 2.6 + (fine - 0.5) * 1.2 - 0.3 * smoothstep(0.55, 0.85, fil) * smoothstep(0.2, 0.8, rq), 0.0, 1.0);
    float shell = smoothstep(0.84, 1.0, rq / rim);
    vec3 lane = vec3(0.85, 0.24, 0.04) * 0.55, cell = vec3(1.0, 0.78, 0.42) * 1.7;
    sunC = mix(lane, cell, pat * pat * (3.0 - 2.0 * pat));
    // the rim: a hotter, brighter shell (the shock)
    sunC = mix(sunC, vec3(1.0, 0.95, 0.88) * 2.6, shell * 0.8);
    // while it's still small, keep it a blinding disk
    sunC = mix(vec3(1.0, 0.95, 0.85) * 9.0, sunC, smoothstep(0.02, 0.12, R));
  }
  c = mix(c, sunC, inside * mix(1.0, 1.0, uLit));
  // the last seconds: everything is the fireball
  if (uBlast > 0.0) {
    vec2 qq = q / (1.0 + uBlast * 10.0);
    float bl = fbm3(vec3(v * 3.0 / (1.0 + uBlast * 2.0) + tt * 0.6));
    vec3 plasma = mix(vec3(1.0, 0.85, 0.6), vec3(0.9, 0.95, 1.0), bl) * (6.0 + 6.0 * bl);
    c = mix(c, plasma, smoothstep(0.2, 1.0, uBlast));
  }
  gl_FragColor = vec4(clamp(c, 0.0, 80.0), 1.0);
}`;

export function makeSky() {
  const V = (x, y, z) => ({ value: new THREE.Vector3(x, y, z) });
  const uniforms = {
    uSun: V(0, 0.2, -1), uAng: { value: 0.00466 }, uLit: { value: 0 }, uPx: { value: 0.0006 }, uTime: { value: 0 }, uT: { value: 0 },
    uWhite: { value: 0 }, uHaze: { value: 0 }, uSmoke: { value: 0 }, uGlare: { value: 0 }, uBlast: { value: 0 }, uDisk: { value: 0 },
    uMerc: V(0, 1, 0), uVen: V(0, 1, 0), uMercOn: { value: 1 }, uVenOn: { value: 1 }, uPlanetI: { value: 0 },
    uCloud: { value: 1 }, uDrift: { value: 0 }, uDark: { value: 0 },
  };
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1000, 64, 32), new THREE.ShaderMaterial({ uniforms, vertexShader: vert, fragmentShader: frag, side: THREE.BackSide, depthWrite: false, depthTest: false }));
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;
  return { mesh, uniforms };
}
