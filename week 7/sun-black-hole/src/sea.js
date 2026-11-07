// The sea: one big plane at sea level. Where the beach (layout.sandY) comes up through it the water ends in a line of
// swash; breakers roll in parallel to the beach in the surf zone. Waves are a spectrum of travelling components, each
// faded once it's smaller than a couple of pixels (no shimmer). It mirrors the sky and the Sun (a glitter path) and, at
// night, the lights: the far city low across the bay, the pier's lamps and Ferris wheel, as streaks broken up by the
// waves. Later: a veil of steam (uSteam), the surf turning to grey slush (uSlush), and the ice growing out from the shore
// (uIce: 0..1 of the way to the horizon), plates and cracks under a dusting of snow.
import * as THREE from 'three';
import { Z_W, PIER, WHEEL, FAR } from './layout.js';

const f1 = (x) => x.toFixed(1);
// the far shore: is p on its land side? (the nearest segment of its waterline decides)
const LAND_GLSL = 'float onLand(vec2 p) { float best = 1e9, side = -1.0; vec2 a, b, t, n; float L, u, d;\n' + FAR.slice(1).map(([bx, bz], i) => { const [ax, az] = FAR[i]; return `a = vec2(${f1(ax)}, ${f1(az)}); b = vec2(${f1(bx)}, ${f1(bz)}); t = b - a; L = length(t); u = clamp(dot(p - a, t) / (L * L), 0.0, 1.0); d = length(p - a - t * u); if (d < best) { best = d; n = vec2(t.y, -t.x) / L; side = dot(p - a, n); }`; }).join('\n') + '\n return side; }';

const vert = /* glsl */ `
varying vec3 vWP;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWP = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

const frag = /* glsl */ `
precision highp float;
varying vec3 vWP;
uniform float uTime; uniform vec3 uSun; uniform float uSunI; uniform vec3 uSkyHi; uniform vec3 uSkyLo; uniform float uPx;
uniform float uSteam; uniform float uSlush; uniform float uIce; uniform float uLights; uniform float uNight; uniform float uCover;
uniform float uCityDim;
float h2(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float n2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(h2(i), h2(i+vec2(1,0)), f.x), mix(h2(i+vec2(0,1)), h2(i+vec2(1,1)), f.x), f.y); }
float vor(vec2 p){ vec2 i = floor(p), f = fract(p); float d1 = 9.0, d2 = 9.0;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) { vec2 o = vec2(float(x), float(y)); vec2 r = o + vec2(h2(i + o), h2(i + o + 17.0)) - f; float d = dot(r, r);
    if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d; }
  return sqrt(d2) - sqrt(d1); }
${LAND_GLSL}
float bedY(float o) {
  if (o <= 0.0) return 2.4 * (1.0 - exp(o / 25.0));
  if (o < 60.0) return -o * 0.035;
  return -2.1 - (o - 60.0) * 0.013 - max(0.0, o - 600.0) * 0.01;
}
vec3 waveN(vec2 p, float dist, float amp, float t) {
  float px = uPx * dist;
  vec2 g = vec2(0.0);
  for (int i = 0; i < 16; i++) {
    float fi = float(i);
    float L = 60.0 * pow(0.78, fi);
    float a = L * 0.0045 * (1.0 + 0.3 * sin(fi * 7.1)) * amp;
    float ang = (h2(vec2(fi, 3.7)) - 0.5) * (0.8 + fi * 0.08);
    vec2 dir = vec2(sin(ang), cos(ang));            // (mostly toward the beach, +z)
    float k = 6.2832 / L;
    float w = sqrt(9.81 * k);
    float fade = 1.0 - smoothstep(L * 0.25, L * 0.6, px * 2.0);
    float ph = dot(p, dir) * k - w * t + fi * 1.7;
    g += dir * cos(ph) * a * k * fade;
  }
  return normalize(vec3(-g.x, 1.0, -g.y));
}
// what the water mirrors at night: the far city's lights low across the bay, the pier's lamps, the Ferris wheel
vec3 lightsIn(vec3 R) {
  float az = atan(R.x, -R.z), el = R.y;
  vec3 c = vec3(0.0);
  float band = exp(-max(el - 0.003, 0.0) / 0.012) * smoothstep(-0.004, 0.004, el);
  float city = smoothstep(0.04, 0.09, az) * (1.0 - smoothstep(0.6, 0.8, az));
  float dots = 0.35 + 0.65 * n2(vec2(az * 900.0, 1.0));
  c += vec3(1.0, 0.7, 0.4) * band * city * dots * 0.7 * (1.0 - 0.5 * uCityDim);
  float paz = atan(${PIER.x.toFixed(1)}, ${(-PIER.z1 * 0.5).toFixed(1)});
  float pier = exp(-pow((az - paz * 1.15) / 0.05, 2.0)) * exp(-max(el, 0.0) / 0.02) * smoothstep(-0.01, 0.0, el);
  c += vec3(1.0, 0.8, 0.5) * pier * 0.45;
  float waz = atan(${WHEEL.x.toFixed(1)}, ${(-WHEEL.z).toFixed(1)});
  float wel = ${(WHEEL.y / -WHEEL.z).toFixed(4)};
  float wh = exp(-pow((az - waz) / 0.05, 2.0)) * exp(-pow((el - wel) / 0.09, 2.0));
  c += vec3(1.0, 0.55, 0.65) * wh * 0.35;
  return c * uLights;
}
void main() {
  float o = ${Z_W.toFixed(2)} - vWP.z;                      // metres out from the waterline
  float bed = bedY(o);
  float depth = -bed;
  if (depth < -0.02) discard;
  if (vWP.z < -1500.0 && onLand(vWP.xz) > 0.0) discard;
  vec3 V = normalize(vWP - cameraPosition);
  float dist = length(vWP - cameraPosition);
  vec2 p = vWP.xz;
  float px = uPx * dist;
  float calm = 1.0 - 0.75 * uSlush;
  vec3 N = waveN(p, dist, calm, uTime);
  // breakers in the surf zone: lines rolling in, white where they break, foam trailing behind
  float zone = smoothstep(2.6, 0.7, depth) * smoothstep(-0.05, 0.2, depth);
  float br = fract(o / 14.0 + uTime * (0.13 - 0.07 * uSlush) + 0.25 * n2(p * 0.03));
  float crest = smoothstep(0.86, 0.97, br) * (1.0 - smoothstep(0.97, 1.0, br));
  float trail = smoothstep(0.35, 0.97, br) * (1.0 - smoothstep(0.97, 1.0, br)) * (0.4 + 0.6 * n2(p * 0.4 + uTime * 0.2));
  float surf = zone * (crest * 0.9 + trail * 0.4);
  surf = mix(surf, zone * 0.3, smoothstep(0.5, 3.0, px));
  // the swash at the edge, running up and back
  float run = 0.5 + 0.5 * sin(uTime * 0.9 + p.x * 0.02 + 1.3 * n2(p * 0.05));
  float swash = smoothstep(0.12 + 0.12 * run, 0.0, depth) * (0.5 + 0.5 * n2(p * 0.2 + uTime * 0.3));
  vec3 R = reflect(V, N);
  R.y = abs(R.y);
  float cosT = max(dot(-V, N), 0.0);
  float F = 0.02 + 0.98 * pow(1.0 - cosT, 5.0);
  vec3 sky = mix(uSkyLo, uSkyHi, smoothstep(0.0, 0.25, R.y));
  vec3 deep = vec3(0.01, 0.07, 0.11), shallow = vec3(0.07, 0.36, 0.36);
  vec3 body = mix(shallow, deep, smoothstep(0.6, 7.0, depth)) * (0.06 + 0.94 * uSunI);
  float slushM = uSlush * smoothstep(8.0, 1.0, depth);
  F *= 1.0 - 0.85 * slushM;
  vec3 col = mix(body, sky, F);
  // the Sun's glitter
  float ca = dot(R, uSun);
  float aS = acos(clamp(ca, -1.0, 1.0));
  col += vec3(1.0, 0.95, 0.85) * uSunI * (exp(-pow(aS / 0.035, 2.0)) * 6.0 + exp(-aS / 0.12) * 0.25);
  // the lights, mirrored
  col += lightsIn(R) * F * 3.0 * uNight;
  vec3 foamC = vec3(0.92, 0.95, 0.96) * (0.08 + 0.92 * uSunI) + vec3(0.05, 0.045, 0.04) * uNight * (1.0 + 2.0 * uLights);
  // slush: the surf thick and grey, ice crystals clouding the water
  vec3 slushC = vec3(0.42, 0.47, 0.5) * (0.08 + 0.92 * uSunI) + vec3(0.06, 0.05, 0.045) * uNight * (1.0 + 2.5 * uLights);
  col = mix(col, slushC * (0.45 + 0.7 * n2(p * 0.9) * n2(p * 0.23 + 3.0)), slushM * 0.92);
  // pancake ice: rounded plates of slush jostling in the swash, their rims pushed up white
  if (slushM > 0.0) {
    vec2 q = p * 1.1 + vec2(0.0, 0.5 * sin(uTime * 0.9 + p.x * 0.05)) + 0.6 * vec2(n2(p * 0.4), n2(p * 0.4 + 5.0));
    float e = vor(q);
    float fadeP = 1.0 - smoothstep(0.15, 0.6, px);
    float gap = 0.12 + 0.18 * n2(p * 0.15);
    float plateK = smoothstep(gap, gap + 0.06, e);
    vec3 pc = mix(slushC * 0.18, slushC * (0.6 + 0.25 * n2(q * 3.0)), plateK);
    float rim = smoothstep(gap, gap + 0.05, e) - smoothstep(gap + 0.08, gap + 0.2, e);
    pc += vec3(0.3, 0.32, 0.35) * (0.08 + 0.92 * uSunI + 0.6 * uLights) * 0.35 * rim;
    col = mix(col, pc, slushM * fadeP * 0.9);
  }
  col = mix(col, mix(foamC, slushC, uSlush), clamp(surf + swash * 0.7, 0.0, 1.0));
  // steam right on the water
  col = mix(col, vec3(0.16, 0.14, 0.13) * (0.4 + 0.6 * n2(p * 0.02 + uTime * 0.1)) * (1.0 + 2.0 * uLights), uSteam * 0.35);
  // the ice, out from the shore
  float front = uIce * 9000.0;
  float iced = smoothstep(front, front - 30.0 - 0.02 * front, o + 25.0 * (n2(p * 0.01) - 0.5));
  if (iced > 0.0) {
    float cr = vor(p * 0.09) * 0.8 + vor(p * 0.31) * 0.2;
    float plate = 0.85 + 0.15 * n2(p * 0.05);
    vec3 iceC = vec3(0.17, 0.2, 0.25) * plate;
    float ridge = 1.0 - smoothstep(0.0, 0.06 + px * 0.01, vor(p * 0.025 + 7.0));
    iceC += vec3(0.16, 0.17, 0.19) * ridge * (1.0 - smoothstep(1.0, 4.0, px));
    iceC *= 1.0 - (1.0 - smoothstep(0.0, 0.05 + px * 0.02, cr)) * 0.45 * (1.0 - smoothstep(0.5, 2.5, px));
    iceC = mix(iceC, vec3(0.34, 0.36, 0.4), uCover * 0.6 * (0.4 + 0.6 * n2(p * 0.13)));
    iceC *= 0.25 + 0.75 * (uLights * 0.6 + 0.4);
    vec3 Ri = reflect(V, vec3(0.0, 1.0, 0.0));
    iceC += lightsIn(Ri) * 0.35 * uNight;
    col = mix(col, iceC, iced);
  }
  // haze toward the horizon
  col = mix(col, uSkyLo * 0.95, smoothstep(3000.0, 30000.0, dist) * 0.85);
  float a = smoothstep(-0.02, 0.05, depth);
  gl_FragColor = vec4(col, a);
}`;

export function makeSea(scene) {
  const u = {
    uTime: { value: 0 }, uSun: { value: new THREE.Vector3(0, 0.5, -0.8) }, uSunI: { value: 1 },
    uSkyHi: { value: new THREE.Color(0.2, 0.4, 0.8) }, uSkyLo: { value: new THREE.Color(0.6, 0.72, 0.88) }, uPx: { value: 0.0006 },
    uSteam: { value: 0 }, uSlush: { value: 0 }, uIce: { value: 0 }, uLights: { value: 0 }, uNight: { value: 0 }, uCover: { value: 0 }, uCityDim: { value: 0 },
  };
  const geo = new THREE.PlaneGeometry(120000, 120000, 1, 1).rotateX(-Math.PI / 2);
  const mat = new THREE.ShaderMaterial({ uniforms: u, vertexShader: vert, fragmentShader: frag, transparent: true,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -8 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 1;
  scene.add(mesh);
  return { mesh, u };
}
